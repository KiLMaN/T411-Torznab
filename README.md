# T411-Torznab

Torznab proxy for T411 French Private Torrent Tracker

It uses Nodejs

# Installation
Simply clone this repository
Then run 
```
npm install
node server.js <port>
```
Then the proxy is listening on the port specified
It will try to connect to http://api.t411.io/ to obtain a token with the credentials set in the server.js file

Now you can configure Sonarr to use this proxy to make requests to T411
