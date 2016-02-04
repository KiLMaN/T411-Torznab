var util = require("util"),
//    xml2js = require("xml2js"),
    request = require("request"),
//    parser = new xml2js.Parser({explicitArray: false}),
    // All the URLs we will be making use of.
    baseUrl = "http://api.tvmaze.com/",
    showInfoUrl = "lookup/shows",
    fullShowInfoUrl = "lookup/shows",
    seachUrl = "singlesearch/shows",
    showInforTvMazeUrl = "shows/";
// Responsible for sending a request down to the url that has
// been passed as an argument.
_request = function(url, callback) {
    request({uri: url}, function(err, response, body) {
        if (!err && response.statusCode == 200) {
           var outJson= JSON.parse (body);
	       	//parser.parseString(body, function(err, result) {
                var output = {'Showinfo' :
			{showname : outJson['name']}
		};
		//body['Showinfo']['showname'] = body.name;
		callback(err,output);
            //});
        } else {
            _httpError(err, response, callback, url);
        }
    });
};

// Responsible for raising an error with the appropriate
// status code.
_httpError = function(error, response, callback,url) {
    var status = (response && response.statusCode) ? (response.statusCode) : (error.code);
    var err = new Error(util.format("TvMaze API responded with status code %s url : %s ",status,url));
    err.http_code = status;
    callback(err);

};

exports.showInfoSearchName = function(showName, callback){
	var url = util.format("%s%s?q=%s",baseUrl,searchUrl,showName);
	_request(url,callback);
};
exports.showInfoTvMaze = function(tvMazeId, callback){
	var url = util.format("%s%s%s",baseUrl, showInforTvMazeUrl,tvMazeId);
	_request(url,callback);
};


// Show info based on a show id that can be acquired via search
// or fullSearch.
exports.showInfoTvRage = function(showId, callback) {
    var url = util.format("%s%s?tvrage=%s", baseUrl, showInfoUrl, showId);
    _request(url, callback);
};

// Full show info based on a show id that can be acquired via search
// or fullSearch.
exports.fullShowInfoTvRage = function(showId, callback) {
    var url = util.format("%s%s?tvrage=%s", baseUrl, fullShowInfoUrl, showId);
    _request(url, callback);
};

