const cookie = require('cookie');
const https = require('https');
const qs = require('querystring');
const compositeSessionKey = 'session';
const endpointKey = 'endpoint';
const subdomainKey = 'subdomain';
const jsessionCookieName = 'JSESSIONID'
const gatewayCookieName = 'ApplicationGatewayAffinity'

module.exports = async function (context, req) {

    context.log('****************************************** JavaScript HTTP trigger function processed a request. ******************************************');
    let queryObj = req.query;
    context.log('Query Object: ' + JSON.stringify(queryObj));
    let connConf = {
        jSessionId: '',
        gatewaySessionId: '',
        teneoEndpoint: '',
        teneoSubdomain: '',
        userInput: queryObj.userinput || '',
        command: queryObj.command || '',
        endSession: queryObj.hasOwnProperty('endsession')
    }

    context.log("endsession: " + connConf.endSession);

    //If the request already contain the session keys it should decode them and send the request on to Teneo.
    // On response check the session values haven't changed and add the encoded session string back into the body of the response to the client.
    if (queryObj.hasOwnProperty(compositeSessionKey) && queryObj[compositeSessionKey]) {
        context.log('Query Object has property session with value: ' + queryObj[compositeSessionKey])
        // Break down session encoding into parts
        let sessionIdStringArray = decomposeSessionString(queryObj[compositeSessionKey], context);
        context.log('Decomposed strings: ' + sessionIdStringArray)
        connConf.jSessionId = sessionIdStringArray[0];
        connConf.gatewaySessionId = sessionIdStringArray[1];
        connConf.teneoEndpoint = sessionIdStringArray[2];
        connConf.teneoSubdomain = sessionIdStringArray[3];
    }

    //If there is no session key, assume new session and create URL from the query.
    else if (queryObj.hasOwnProperty(endpointKey) && queryObj.hasOwnProperty(subdomainKey)) {
        context.log('Query has no session, only endpoint and subdomain with values: ' + queryObj[endpointKey] + ':::' + queryObj[subdomainKey])
        connConf.teneoEndpoint = queryObj[endpointKey];
        connConf.teneoSubdomain = queryObj[subdomainKey];
    } else {
        context.res = {
            status: 400,
            body: 'Expecting either both "endpoint" and "subdomain" parameters or a single "session" parameter. Optional parameters "userinput", "command", "endsession". '
        };
        return false;
    }

    await teneoRequest(connConf, context).then((teneoResponse) => {

        if (connConf.endSession) {
            teneoResponse.body.sessionId = 'Session Ended.'
        } else if (teneoResponse.hasOwnProperty('cookie')) {
            connConf.jSessionId = teneoResponse.cookie[jsessionCookieName];
            connConf.gatewaySessionId = teneoResponse.cookie[gatewayCookieName];
            teneoResponse.body.sessionId = composeSessionString(connConf, context);
        } else if (queryObj.hasOwnProperty(compositeSessionKey)) {
            teneoResponse.body.sessionId = queryObj[compositeSessionKey]
        } else {
            throw new Error('Teneo response does not contain the headers with the cookie values and no session slug was provided by the client.')
        }


        context.res = {
            status: 200,
            body: JSON.stringify(teneoResponse.body)
        };

    }).catch((err) => {
        context.log(err.stack)
    });

}

function teneoRequest(connConf, context) {

    return new Promise((resolve, reject) => {
        context.log('Teneo request with conf: ' + JSON.stringify(connConf));

        let postDataObj = {
            viewtype: 'tieapi'
        }

        if (connConf.userInput) {
            postDataObj.userinput = connConf.userInput;
        }
        if (connConf.command) {
            postDataObj.command = connConf.command
        }

        let postDataString = qs.stringify(postDataObj);

        let host = connConf.teneoEndpoint === 'test' ? 'longberry-en-prod-staging.artificial-solutions.com' : connConf.teneoEndpoint + '.' + connConf.teneoSubdomain + 'teneo.solutions'
        let path = (connConf.teneoEndpoint === 'test' ? '/longberry/' : '/') + (connConf.endSession ? 'endsession' : '')

        context.log("hostpath: " + host + path)

        let req = https.request({
            host: host,
            method: 'POST',
            path: path,
            port: 443,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postDataString.length,
                'Cookie': 'JSESSIONID=' + connConf.jSessionId + '; ApplicationGatewayAffinity=' + connConf.gatewaySessionId + '; ApplicationGatewayAffinityCORS=' + connConf.gatewaySessionId
            }
        }, (res) => {
            let body = []
            res.on('data', (chunk) => body.push(chunk))
            res.on('end', () => {

                let resValues = {
                    body: JSON.parse(Buffer.concat(body).toString()),
                }
                if (res.headers.hasOwnProperty("set-cookie")) {
                    resValues.cookie = cookie.parse(res.headers["set-cookie"].join(';'))
                }
                context.log(resValues);
                resolve(resValues);
            })
        });

        req.on('error', (err) => {
            context.log('Request Error: ' + err.stack);
            reject(err);
        })

        req.on('timeout', () => {
            context.log('Connection to Teneo timed out')
            req.destroy();
            reject(new Error('Request time out'));
        })


        context.log('Body for Teneo request: ' + postDataString)
        req.write(postDataString);
        req.end();

    })
}

function composeSessionString(connConf, context) {
    let slug = connConf.jSessionId + "|" + connConf.gatewaySessionId + "|" + connConf.teneoEndpoint + "|" + connConf.teneoSubdomain;
    context.log('Session slug: ' + slug);
    let encodedSlug = Buffer.from(slug, 'binary').toString('base64');
    context.log('Encoded slug:' + encodedSlug);
    return encodedSlug
}

function decomposeSessionString(sessionInfo, context) {
    context.log('Decomposing session string: ' + sessionInfo);
    let decodedStringArray = Buffer.from(sessionInfo, 'base64').toString('binary').split('|')
    context.log('Decoded strings: ' + decodedStringArray);
    return decodedStringArray;
}