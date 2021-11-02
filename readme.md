# Teneo Session Proxy

This proxy is only to be used from environments where the recommended session handling is not available. 
This approach relies on the client being able to manipulate query strings from a URL.

1) In environments where third-party cookies cannot be set to save the sessions. If cookies are available, this is the preferred mode. 
2) In environments where the client cannot read the session IDs from the headers and cannot compose a custom header to return this value. This is the backup mode for cookie-less environments.

The proxy will have a single endpoint for all users: 
https://teneo-session-proxy.azurewebsites.net/api/HttpTrigger/ (temp, prod TBD) 

## Usage

To open a new session, send a request to the session proxy with an _endpoint_ and a _subdomain_ parameters. These values are the ones in your endpoint URL.
For example, if your endpoint URL is https://longberry-en-prod.coffeeCorp.teneo.solutions, you would send a request that looks like this:

    https://teneo-session-proxy.azurewebsites.net/api/HttpTrigger/?subdomain=...&endpoint=...

In the typical Teneo response body, there will be a _session_ field, but instead of containing only the Tomcat's JSessionId, 
it additionally contains the ApplicationGatewayAffinity session, the endpoint and the subdomain rolled into a base 64 token. 

In all subsequent requests, the only necessary parameter is _session_, with the token mentioned above as a value.

    https://teneo-session-proxy.azurewebsites.net/api/HttpTrigger/?session=...

Both in the initial request and in the subsequent ones, parameters _userinput_ and _command_ are legal, and they will be passed to the engine for processing.

    https://teneo-session-proxy.azurewebsites.net/api/HttpTrigger/?session=...&userinput=...&command=...

To end a session, send parameter _endsession_ with no value, together with the session parameter and value.

    https://teneo-session-proxy.azurewebsites.net/api/HttpTrigger/?session=...&endsession


