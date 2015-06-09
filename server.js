// User variables
var userName = "***";
var userPass = "***";

// Require 
var express = require ('express');
//var _ = require ('underscore');
//var FeedParser = require ('feedparser');
//var RSS = require ('rss');
var tvrage = require('nodejs-tvrage');
var request = require ('request');
var xml = require('xml');

var app = express ();


var DEFAULT_LIMIT = 50;
// System variables
var baseUrl = "http://api.t411.io";
var userToken = ""; // Holds the user token for the T411 API
var applicationPort = process.argv[2];


//var fs = require('fs');
//var util = require('util');
//var log_file = fs.createWriteStream(__dirname + '/debug.log', {flags : 'w'});
//var log_stdout = process.stdout;

//console.log = function(d) { //
//	  log_file.write(util.format(d) + '\n');
//	    log_stdout.write(util.format(d) + '\n');
//};

app.get ('/api', function (req, res)
{
//	console.log(req.query);
	var thisHostName = (req.headers['x-forwarded-host']) ? (req.headers['x-forwarded-host'] ) : ('127.0.0.1:'+applicationPort);
	thisHostName = 'http://' + thisHostName;
	/*var feed = new RSS (
	{
		title: 'T411 Torznab Wrapper',
		description: 'Torznab wrapper for T411',
		language: 'fr', 
		custom_namespaces:{
			'torznab':'http://torznab.com/schemas/2015/feed'
		}
	}); */
	
	if(req.query.t && req.query.t == 'caps')
	{

		var xmlString = xml({
			'caps':
			[
				{'server':{_attr:{'version':'1.0','title':'T411 Torznab','image':'http://www.t411.io/themes/blue/images/logo.png'}}}, 
				{'limits':{_attr:{'max':'100','default':DEFAULT_LIMIT}}},
				{'registration':{_attr:{'available':'no','open':'no'}}},
				{'searching':[
					{'search':{_attr:{'available':'yes'}}},
					{'tv-search':{_attr:{'available':'yes'}}},
					{'movie-search':{_attr:{'available':'no'}}},
				]},
				{'categories':[
					{'category':{_attr:{'id':'433','name':'Séries TV'}}},
				]}
			]
		});
        

        res.contentType('text/xml');
		//res.write('<?xml version="1.0" encoding="utf-8"?>\n');
        res.send('<?xml version="1.0" encoding="utf-8"?>\n' + xmlString);
		return ;
	}
	else if(req.query.t && req.query.t == 'search')
	{
		var query =(req.query.q) ? req.query.q : "";
		var requestData = {
			url: baseUrl + "/torrents/search/"+query,
			headers:{
				'Authorization':userToken
			}
		}; 
		request (requestData, 
			function(error, response, body)
			{
				if (!error && response.statusCode == 200)
				{
					//console.log(body);
					var xmlString;
					try {
						var jsonResp = JSON.parse (body);
						
						var torrentList = [];
						jsonResp.torrents.forEach( function(result) {
							torrentList.push(toFeedItem(result,thisHostName));
						});
						
						xmlString = xml({
							'rss':
							[	
								
								{_attr:{'version':'2.0','xmlns:torznab':'http://torznab.com/schemas/2015/feed'}},
								{'channel':
								[
									{'title':'T411 Torznab'}, 
									{'description':'T411 Torznab search result for '+jsonResp.query}, 
									{'torznab:response':{_attr:{'offset':jsonResp.offset,'total':jsonResp.total}}}, 
									
								].concat(torrentList)
								}
							]
						});
					}
					catch (e)
					{
						console.log("Exception : "+e);
						xmlString = xml({
							'rss':
							[	
								
								{_attr:{'version':'2.0','xmlns:torznab':'http://torznab.com/schemas/2015/feed'}},
								{'channel':
								[
									{'title':'T411 Torznab'}, 
									{'description':'T411 Torznab search result'}, 
									{'torznab:response':{_attr:{'offset':'0','total':'0'}}}
								]
								}
							]
						});
					}
					res.contentType('text/xml');
					//res.write('<?xml version="1.0" encoding="utf-8"?>\n');
					res.send('<?xml version="1.0" encoding="utf-8"?>\n' + xmlString);
				}
			}
		);
	}
	else if(req.query.t && req.query.t == 'tvsearch')
	{						
		function research(urlSearch,functionCall,originalQuery)
		{
			var offset = (originalQuery.offset) ? (originalQuery.offset) : 0;
			var limit = (originalQuery.limit) ? (originalQuery.limit) : DEFAULT_LIMIT;
			urlSearch += '?offset='+offset+'&limit='+limit;
			var requestData = {
				url: urlSearch,
				headers:{
					'Authorization':userToken
				}
			}; 
			console.log(requestData);
			request (requestData,functionCall); 
		}
		function reponseTvSearch(error, response, body)
		{
			if (!error && response.statusCode == 200)
			{
				//console.log(body);
				var xmlString;
				try {
					if(body.indexOf("</div>") != -1)
						body = body.substring(body.lastIndexOf("</div>") + 6 );
					//console.log(body);
					var jsonResp = JSON.parse (body);
					
					var torrentList = [];
					jsonResp.torrents.forEach( function(result) {
						if(typeof result != 'object') // if the result is not a object (there is no details of the torrent )
							return;
						torrentList.push(toFeedItem(result,thisHostName));
					});
					
					xmlString = xml({
						'rss':
						[	
							
							{_attr:{'version':'2.0','xmlns:torznab':'http://torznab.com/schemas/2015/feed'}},
							{'channel':
							[
								{'title':'T411 Torznab'}, 
								{'description':'T411 Torznab search result for '+jsonResp.query}, 
								{'torznab:response':{_attr:{'offset':jsonResp.offset,'total':jsonResp.total}}}, 
								
							].concat(torrentList)
							}
						]
					});
				}
				catch (e)
				{
					console.log("Exception : "+e);
					xmlString = xml({
						'rss':
						[	
							
							{_attr:{'version':'2.0','xmlns:torznab':'http://torznab.com/schemas/2015/feed'}},
							{'channel':
							[
								{'title':'T411 Torznab'}, 
								{'description':'T411 Torznab search result'}, 
								{'torznab:response':{_attr:{'offset':'0','total':'0'}}}
							]
							}
						]
					});
				}
				res.contentType('text/xml');
				//res.write('<?xml version="1.0" encoding="utf-8"?>\n');
				//console.log(xmlString);
				res.send('<?xml version="1.0" encoding="utf-8"?>\n' + xmlString);
			}
		}
		
		
		
		var query = (req.query.q) ? req.query.q : "";
		if(req.query.rid)
		{
			
			(new tvrage()).showInfo(req.query.rid, function(show) {
				show.name = show.name.replace(/\([0-9]*\)/gmi, "").trim();
				show.name = show.name.replace(/\((US|FR|ES)\)/gmi, "").trim();
				show.name = show.name.replace(/['|"](s)*/gmi, "").trim();
				if (req.query.ep) { //This is an episode
					query = show.name + ' S' + pad(+req.query.season, 2) + 'E' + pad(+req.query.ep, 2);
				}
				else { //This is a season
					query = show.name + ' ' + req.query.season;
				}
				research( baseUrl + "/torrents/search/"+query ,reponseTvSearch,req.query);
			});
		}
		else
				research( baseUrl + "/torrents/search/" ,reponseTvSearch,req.query);
		
	}
	else
	{

		var requestData = {
			url: baseUrl + "/categories/tree",
			headers:{
				//'User-Agent': 'request', 
				//'Accept-Encoding': 'identity', 
				//'Accept': '*/*', 
				'Authorization':userToken
			}
		}; 

		//console.log ("Request : %j", requestData);
		function callBackTerms (error, response, body)
		{
			if (!error && response.statusCode == 200)
			{
				res.send (body);
			}
		}
		request (requestData, callBackTerms);
	}
});

app.get ('/torrent/:torrentid',
	function (req, res){
		console.log ("get torrent : " + req.params.torrentid  );
		//var tName = (req.query.n) ? req.query.n : "torrent";
		if (!isNaN (req.params.torrentid) && req.params.torrentid != 0)
		{
			var requestData = {
				url: baseUrl +  "/torrents/download/" + req.params.torrentid,
				headers:{
					'Authorization':userToken
				}
			}; 
			function callBackTorrent (error, response, body)
			{
				if (!error && response.statusCode == 200)
				{
					res.contentType('application/x-bittorrent');
					res.setHeader('Content-Disposition','attachment; filename="'+req.params.torrentid+'.torrent"');
					res.write(body);
				}
			}
			request (requestData/*,callBackTorrent*/).pipe(res);
			//console.log ("Resuest : %j", requestT411.headers);
			//req.pipe (requestT411).pipe (res);
		}
		else
		{
			res.contentType ('text/plain');
			res.status (404); 
			res.send ("Torrent not found");
		}
	}
);
function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}
function toFeedItem (torrent,thisHostName)
{
	return {
		'item':
		[	
			{title: torrent.name},
			{guid: torrent.id}, 
			{enclosure:{_attr:{
				'url': thisHostName+'/torrent/'+torrent.id,
				'length': 500000000, 
				'type':'application/x-bittorrent'
				}}	
			},
			{link: thisHostName+'/torrent/'+torrent.id}, 
			/*{custom_elements:[*/
				{'description':torrent.name},
				{'pubDate':(new Date (torrent.added).toGMTString ())},
				//{'category': 'HDTV 1080p'},
				//{'link':''},
				//{'torznab:attr': { _attr: { name: 'rageid', value: '37780'}}},
				//{'torznab:attr':{_attr:{name: 'infohash'		, value:torrent['showrss:info_hash']['#']}}},
				//{'torznab:attr':{_attr:{name: 'magneturl'		, value:torrent.link}}},
				{'torznab:attr':{_attr:{name: 'seeders'			, value:torrent.seeders}}},
				{'torznab:attr':{_attr:{name: 'leechers'		, value:torrent.leechers}}},
				//{'torznab:attr':{_attr:{name: 'minimumratio'	, value:'0.0'}}},
				//{'torznab:attr':{_attr:{name: 'minimumseedtime'	, value:'0.0'}}},
				{'torznab:attr':{_attr:{name: 'size'			, value:torrent.size}}},
			/*	]
			}*/
		]
	};
}

var requestData = {
	url:"http://api.t411.io/auth",
	method:'POST',
	//headers:{
	//	'User-Agent':'request',
	//	'Accept-Encoding':'identity',
	//	'Accept':'*/*',
	//},
	form: {
		'username':userName,
		'password':userPass
	}
};

function callBackLogin (error, response, body)
{
	if (!error && response.statusCode == 200)
	{
		var jRet = JSON.parse (body);
		userToken = jRet.token;
		console.log ("Got token : ", userToken);
	}
}

request (requestData, callBackLogin);
app.listen (applicationPort);
console.log ('Server listening on port ' + applicationPort);
exports = module.exports = app;
