// Insure that we run  in the same directory as the script file
process.chdir(__dirname);

// User variables
var config = require("./config.json");
var userName = config.username;
var userPass = config.password;
var applicationPort = config.listenPort;

// Require 
var path = require('path');
var _ = require('underscore');
var express = require ('express');
//var tvrage = require('tvragejson');
var request = require ('request');
var xml = require('xml');
var NodeCache = require('node-cache');
var tvmaze = require('./tvmaze.js');
var argv = require('minimist')(process.argv.slice(2));
var _logger = require('./logger.js');



_logger.info("Starting T411 proxy");
_logger.info("Running in : " + process.cwd());
if(argv.port != undefined)
{
	applicationPort = argv.port;
	_logger.debug("Overriding port ! New port is :"+applicationPort);
}

// Configuration
var DEFAULT_LIMIT = 50;
var TVRAGE_CACHE_MINS = 300; // 5Hours

// System variables
var baseUrl = "http://api.t411.ch";
var baset411 = "https://www.t411.ch";
var userToken = ""; // Holds the user token for the T411 API

var _T411_CatTVShow = {name:"SÃ©rie TV", idCat : 0};
var _T411_CatFilms  = {name:"Film", 	idCat : 0};

var _T411_TermsPrefixSeasons = 	{name :"SÃ©rieTV - Saison", 	idTerm : 0, values:[]};
var _T411_TermsPrefixEpisodes = {name :"SÃ©rieTV - Episode", 	idTerm : 0, values:[]};


var app = express ();
var tvRageCache = new NodeCache({stdTTL:TVRAGE_CACHE_MINS * 60});
var tvMazeCache = new NodeCache({stdTTL:TVRAGE_CACHE_MINS * 60});
var T411Categories = [];

function _TorznabServerPresentation(res)
{
	var xmlString = {
		'caps':
			[
			{'server':{_attr:{'version':'1.0','title':'T411 Torznab','image':baset411+'/themes/blue/images/logo.png'}}}, 
			{'limits':{_attr:{'max':'100','default':DEFAULT_LIMIT}}},
			{'registration':{_attr:{'available':'no','open':'no'}}},
				{'searching':[
					{'search':{_attr:{'available':'yes'}}},
					{'tv-search':{_attr:{'available':'yes','supportedParams':'q,rid,tvdbid,tvmazeid,season,ep'}}},
					{'movie-search':{_attr:{'available':'no'}}},
				]},
				{'categories':[]}
			]
	};


	var categoriesXml = xmlString.caps[_.findIndex(xmlString.caps, 'categories')]['categories'];
	T411Categories.forEach(function(category)
			{
				if(category.pid == 0) // Root Category
				{
					categoriesXml.push({'category':[
						{_attr:{'id':category.id,'name':category.name}}]
					});
				}
				else
				{ // sub Category
					_.find(categoriesXml, function(obj) {
						return _.find(obj.category,function(objc) {
							return objc._attr != undefined && objc._attr.id == category.pid;
						}) != undefined;
					})['category'].push(
						{'subcat':[
							{_attr:{'id':category.id,'name':category.name}}]
						});
				}
			});

	res.contentType('text/xml');
	res.send('<?xml version="1.0" encoding="utf-8"?>\n' + xml(xmlString));
}


function reponseSearch(error, response, body)
{
	var context = this.context;
	if (!error && response.statusCode == 200)
	{
		var xmlString;
		try {
			// Remove <div> warnings if they exists
			if(body.indexOf("</div>") != -1)
				body = body.substring(body.lastIndexOf("</div>") + 6 );

			var jsonResp = JSON.parse (body); // Parse The JSON
			
			if(jsonResp.error != undefined)
			{
				if(jsonResp.code == 201 || jsonResp.code == 202)
				{

					loginT411();
				
				}
			}

			var torrentList = [];
			if(jsonResp.torrents != undefined)
			{
				jsonResp.torrents.forEach( function(result) {
					if(typeof result != 'object') // if the result is not a object (there is no details of the torrent )
						return;
					if(config.onlyVerified && 0 == result.isVerified)
					{
						_logger.debug("Torrent "+result.name +" is not verified skipping !");
						return;
					}
					torrentList.push(_toTorznabElement(result, context.thisHostName));
				});
				_logger.debug("Got "+torrentList.length+" torrents");	
				xmlString = xml({
					'rss':
						[	
						{_attr:{'version':'2.0','xmlns:torznab':'http://torznab.com/schemas/2015/feed'}},
						{'channel':[
							{'title':'T411 Torznab'}, 
							{'description':'T411 Torznab search result for "'+jsonResp.query+'"'}, 
							{'torznab:response':
								{_attr:{
										   'offset':jsonResp.offset,
										   'total':jsonResp.total
									   }
								}
							}, 
						].concat(torrentList)
						}	
						]
				});
			}
			else
			{
				xmlString = xml({
					'rss':
						[
						{_attr:{'version':'2.0','xmlns:torznab':'http://torznab.com/schemas/2015/feed'}},
						{'channel':[
							{'title':'T411 Torznab'}, 
							{'description':'T411 Torznab search result'}, 
							{'torznab:response':{_attr:{'offset':'0','total':'0'}}}
						]
						}
						]
				});
			}
		}
		catch (e)
		{
			_logger.error(e);
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
		context.res.contentType('text/xml');
		context.res.send('<?xml version="1.0" encoding="utf-8"?>\n' + xmlString);
	}
}

function research(urlSearch,callback,originalQuery)
{
	var offset = (originalQuery.offset) ? (originalQuery.offset) : 0;
	var limit = (originalQuery.limit) ? (originalQuery.limit) : DEFAULT_LIMIT;
	var regexArgs = /\?/;
	if(regexArgs.test(urlSearch))
		urlSearch += '&offset='+offset+'&limit='+limit;
	else
		urlSearch += '?offset='+offset+'&limit='+limit;
	var requestData = {
		url: urlSearch,
		headers:{
			'Authorization':userToken
		}
	}; 
	_logger.debug(requestData);
	request (requestData,callback); 
}
function researchTvRage(show,context) {
	var showName = show['Showinfo']['showname'];
	_logger.debug("Researching for : " + showName);
	showName = showName.replace(/\([0-9]*\)/gmi, "").trim();
	showName = showName.replace(/\((US|FR|ES)\)/gmi, "").trim();
	showName = showName.replace(/['|"](s)*/gmi, "").trim();
	
	_logger.debug("Clean Name : "+showName);
	var query = (context.req.query.q) ? context.req.query.q : showName;
	query += "?term[51][]=1210";
	if(context.req.query.season)
	{
		var seasonNumber = parseInt(context.req.query.season,10);
		query += "&term["+ _T411_TermsPrefixSeasons.idTerm+"][]="+_T411_TermsPrefixSeasons.values[seasonNumber]+"";
		if(context.req.query.ep) { // Episode
			var episodeNumber = parseInt(context.req.query.ep,10);
			query += "&term["+ _T411_TermsPrefixEpisodes.idTerm + "][]=" + _T411_TermsPrefixEpisodes.values[episodeNumber] +"";
		}
		else // Whole season
		{
		}
	}
	research( baseUrl + "/torrents/search/"+query ,reponseSearch.bind( {context: context} ),context.req.query);
}
function tvMazeResult(err,show)
{
	var context = this.context;
	//var req = this.req; // using binded context
	if(err)
	{
		_logger.error("TvMaze Error : "+err);
		if(err.http_code == 404)
		{
			_logger.warn("Error from tvMaze 404 Not Found !");
			context.res.contentType ('text/plain');
			context.res.status (404);
			//tvmaze.showSearchName(req.query.name, tvRageResult);	
		}
		else
			tvmaze.showInfoTvMaze(req.query.tvmazeid, tvRageResult);
	}
	else
	{
		_logger.debug("Got informations from TvMaze");
		tvMazeCache.set(context.req.query.tvmazeid,show);
		
		researchTvRage(show,context);
	}
}function tvRageResult(err,show)
{
	var context = this.context;
	//var req = this.req; // using binded context
	if(err)
	{
		_logger.error("TvRage Error : "+err);
		if(err.http_code == 404)
		{
			_logger.warn("Error from TvRage 404 Not Found !");
			context.res.contentType ('text/plain');
			context.res.status (404);
			//tvmaze.showSearchName(req.query.name, tvRageResult);	
		}
		else
			tvmaze.showInfoTvRage(req.query.rid, tvRageResult);
	}
	else
	{
		_logger.debug("Got informations from TvRage");
		tvRageCache.set(context.req.query.rid,show);
		
		researchTvRage(show,context);
	}
}

// Map URL
app.get ('/api', function (req, res)
		{
			var context = {
				thisHostName : 'http://' + ((req.headers['x-forwarded-host']) ? (req.headers['x-forwarded-host'] ) : (req.hostname + ':' + applicationPort)),
				req : req,
				res : res,
			};
		
			if(context.req.query.t && context.req.query.t == 'caps')

			{
				_TorznabServerPresentation(context.res);
				return;
			}
			else if(context.req.query.t && context.req.query.t == 'search')
			{
				var query =(context.req.query.q) ? context.req.query.q : "";
				research( baseUrl + "/torrents/search/"+query ,reponseSearch.bind( {context: context} ),context.req.query);
			}
			else if(context.req.query.t && context.req.query.t == 'tvsearch')
			{						
				_logger.debug(context.req.query);
				if(context.req.query.tvmazeid)
				{
					_logger.debug("Requested TvMaze Id : "+context.req.query.tvmazeid);
					var cachedShow = tvMazeCache.get(context.req.query.tvmazeid);
					if(cachedShow == undefined)
					{
						_logger.debug("TvMaze Cache for "+context.req.query.tvmazeid+" empty, querying tvMaze");
						tvmaze.showInfoTvMaze(context.req.query.tvmazeid,tvMazeResult.bind({context:context}));
					}
					else 
					{
						_logger.debug("TvMaze Cache hit for " +context.req.query.tvmazeid);
						researchTvRage(cachedShow,context);
					}

				}
				else if(context.req.query.rid)
				{
					_logger.debug("Requested TvRage ID : "+context.req.query.rid);
					var cachedShow = tvRageCache.get(context.req.query.rid);
					if(cachedShow == undefined)
					{
						_logger.debug("TvRage Cache for "+context.req.query.rid+" empty, querying tvRage");
						tvmaze.showInfoTvRage(context.req.query.rid,tvRageResult.bind({context:context}));
					}
					else 
					{
						_logger.debug("TvRage Cache hit for " +context.req.query.rid);
						researchTvRage(cachedShow,context);
					}
				}

				else
				{
					var query = (context.req.query.q) ? context.req.query.q : "";
					query += "?term[51][]=1210";
					_logger.debug("Query : " + query);
					_logger.debug(context.req.query);
					if(context.req.query.season)
					{						
						var seasonNumber = parseInt(context.req.query.season,10);
						query +=  "&term["+ _T411_TermsPrefixSeasons.idTerm+"][]="+_T411_TermsPrefixSeasons.values[seasonNumber]+"";
						if(context.req.query.ep) { // Episode
							var episodeNumber = parseInt(context.req.query.ep,10);
							query += "&term["+ _T411_TermsPrefixEpisodes.idTerm + "][]=" + _T411_TermsPrefixEpisodes.values[episodeNumber] +"";
						}
						else // Whole season
						{
						}

					}
					research( baseUrl + "/torrents/search/"+query ,reponseSearch.bind( {context:context} ),context.req.query);
				}
			}
			else
			{

			}
		});

app.get ('/torrent/:torrentid',
	function (req, res){
		_logger.debug ("get torrent : " + req.params.torrentid  );
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
			request (requestData).pipe(res);	
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
function _toTorznabElement (torrent,currentHostname)
{
	return {
		'item':
		[	
			{title: torrent.name},
			{guid: torrent.id}, 
			{enclosure:{
					   _attr:{
						   'url': currentHostname+'/torrent/'+torrent.id, // Download link (via this proxy)
						   'length': torrent.size, 
						   'type':'application/x-bittorrent'
					   }
				   }	
			},
			{'link': currentHostname+'/torrent/'+torrent.id}, // Download link (via this proxy)
			{'links' : [
				{
					'link':{_attr:{'length':torrent.size}},
					'link':{_attr:{'length':torrent.size}},
					//'2':{'url':currentHostname+'/torrent/'+torrent.id}
				}
			]},
			{'description':	torrent.name},
			{'pubDate':		(new Date (torrent.added).toGMTString ())},
			{'comments': 	baset411+'/t/'+torrent.id},
			//{'category': 'HDTV 1080p'},

			//{'torznab:attr': { _attr: { name: 'rageid', value: '37780'}}},
			//{'torznab:attr':{_attr:{name: 'infohash'		, value:torrent['showrss:info_hash']['#']}}},
			//{'torznab:attr':{_attr:{name: 'magneturl'		, value:torrent.link}}},
			{'torznab:attr':{_attr:{name: 'seeders'			, value:torrent.seeders}}},
			{'torznab:attr':{_attr:{name: 'leechers'		, value:torrent.leechers}}},
			//{'torznab:attr':{_attr:{name: 'minimumratio'	, value:'0.0'}}},
			//{'torznab:attr':{_attr:{name: 'minimumseedtime'	, value:'0.0'}}},
			{'torznab:attr':{_attr:{name: 'size'			, value:torrent.size}}},
		]
	};
}

// Parse the output of T411 Categories and populate T411Categories with them
function callbackT411Cats(error,response,body)
{
	if(!error && response.statusCode == 200)
	{
		var jsonResult = JSON.parse(body);

		var ids = Object.keys(jsonResult); // Get all ids 
		ids.forEach( function(idCat) {
			if(typeof jsonResult[idCat] != 'object' || jsonResult[idCat].name == undefined) 
				return;
			var currentCat = {id:idCat,name: jsonResult[idCat].name,pid:jsonResult[idCat].pid};
			T411Categories.push(currentCat);

			var idChilds = Object.keys(jsonResult[idCat]['cats']); // Get childs ids
			idChilds.forEach( function(idChildCat) {
				if(typeof jsonResult[idCat]['cats'][idChildCat] != 'object' || jsonResult[idCat]['cats'][idChildCat].name == undefined) 
					return;
				var currentChildCat = {
					'id':idChildCat,
					'name': jsonResult[idCat]['cats'][idChildCat].name,
					'pid':jsonResult[idCat]['cats'][idChildCat].pid
				};
				T411Categories.push(currentChildCat);
			});
		});
		_logger.debug("Got "+T411Categories.length+" categories from T411 !");

		T411Categories.forEach(function(category)
				{
					if(category.name == _T411_CatTVShow.name)
						_T411_CatTVShow.value = category.id;

					if(category.name == _T411_CatFilms.name)
						_T411_CatFilms.value = category.id;

				});

		getT411Terms();
	}
}
// Request Categories from T411
function getT411Cats()
{
	var requestData ={
		url : baseUrl +"/categories/tree/",
		headers:{
			'Authorization':userToken
		}
	};
	request (requestData,callbackT411Cats); 
}


// Parse the output of T411 Terms and populate T411Categories with them
function callbackT411Terms(error,response,body)
{
	if(!error && response.statusCode == 200)
	{
		var jsonResult = JSON.parse(body);
		var ids = Object.keys(jsonResult); // Get category ids 
		ids.forEach( function(idCat) {
			if(typeof jsonResult[idCat] != 'object') 
				return;

			var listTermsCat = [];	
			var idTerms = Object.keys(jsonResult[idCat]);
			idTerms.forEach( function(idTerm) {
				if(typeof jsonResult[idCat][idTerm] != 'object') 
					return;

				var currentTerm = {'name':jsonResult[idCat][idTerm]['type'],'id':idTerm,'values':[]};	
				var idValTerms = Object.keys(jsonResult[idCat][idTerm]['terms']);
				idValTerms.forEach( function(idValTerm) {
					currentTerm['values'].push({'val' : jsonResult[idCat][idTerm]['terms'][idValTerm],'id':idValTerm});
				});
				listTermsCat.push(currentTerm);

			});
			// Now let's find the category to add the terms to
			for(var i = 0; i < T411Categories.length ; i++)
			{
				if(T411Categories[i].id == idCat)	
				{	
					T411Categories[i]['terms'] = listTermsCat;

					if(T411Categories[i].id == _T411_CatTVShow.value)
					{
						var regexSeason = /Saison ([0-9]{2})/i;
						var regexEpisode = /Episode ([0-9]{2})/i;

						var ListTermsEpisode =_.find(listTermsCat, function(obj) { return obj.name == _T411_TermsPrefixEpisodes.name;});
						_T411_TermsPrefixEpisodes.idTerm = ListTermsEpisode.id;
						_.forEach(ListTermsEpisode.values,function(ob)
								{
									if(regexEpisode.test(ob.val))
									{
										var episodeNumber = parseInt(ob.val.match(regexEpisode)[1],10);
										_T411_TermsPrefixEpisodes.values[episodeNumber] = ob.id;
									}
								});

						var ListTermsSeason =_.find(listTermsCat, function(obj) { return obj.name == _T411_TermsPrefixSeasons.name;});
						_T411_TermsPrefixSeasons.idTerm = ListTermsSeason.id;
						_.forEach(ListTermsSeason.values,function(ob)
								{
									if(regexSeason.test(ob.val))
									{
										var seasonNumber = parseInt(ob.val.match(regexSeason)[1],10);
										_T411_TermsPrefixSeasons.values[seasonNumber] = ob.id;
									}
								});

					}
				}
			}
		});

		app.listen (applicationPort);
		_logger.info ('Server listening on port ' + applicationPort);
	}
}
// Request Terms from T411
function getT411Terms()
{
	var requestData ={
		url : baseUrl +"/terms/tree/",
		headers:{
			'Authorization':userToken
		}
	};
	request (requestData,callbackT411Terms); 
}

app.get('/test', function(req, res){
	res.contentType('text/json');
	res.write(JSON.stringify(T411Categories));
});
function callbackLoginT411 (error, response, body)
{
	if (!error && response.statusCode == 200)
	{
		var jRet = JSON.parse (body);
		
		if(userToken == "")
		{

			if(jRet.token)
			{
				userToken = jRet.token;
				_logger.debug ("Got token from T411 : "+ userToken);
				_logger.info("T411 login successfull ! ");
				getT411Cats();
	
			}
			else
			{
				_logger.err("Failed to login to T411 : Please verify your credentials in 'config.json'");
				process.exit(-1);	       
			}
		}
		else
		{
			if(jRet.token)
			{
				userToken = jRet.token;
				_logger.debug ("Got token from T411 : "+ userToken);
				_logger.info("T411 relogin successfull ! ");
	
			}
			else
			{
				_logger.error("Failed to login to T411 : Please verify your credentials in 'config.json'");
				process.exit(-1);	       
			}
		}
	}
	else
	{
		if(error)
			_logger.error("Cannot log in to T411 : "+error);
		else
		{
			_logger.error("Response from T411 invalid. Error : "+response.statusCode);
			setTimeout(loginT411,1*60*1000);
		}
	}
}
function loginT411()
{
	var requestData = {
		url: baseUrl+"/auth",
		method:'POST',
		form: {
			'username':userName,
			'password':userPass
		}
	};
	_logger.info("Trying to log into T411 with user : '"+userName+"'");
	request (requestData, callbackLoginT411); // Login then start server if sucessfull
}
loginT411();
exports = module.exports = app;
