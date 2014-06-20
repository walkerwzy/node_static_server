var PORT = process.argv[2] || 9100;
var http = require("http");
var url = require("url");
var fs = require("fs");
var path = require("path");
var mime = require("./mime").types;
var config = require("./config");
var utils = require("./utils");
var zlib = require("zlib");

var server = http.createServer(function(request, response) {
	console.log(new Date().toISOString(), request.url);
    response.setHeader("Server", "Node/V5");
    response.setHeader('Accept-Ranges', 'bytes');
    var pathname = decodeURI(url.parse(request.url).pathname);
    var realPath = path.join("assets", path.normalize(pathname.replace(/\.\./g, "")));
    var pathHandle = function (realPath) {
        fs.stat(realPath, function (err, stats) {
            if (err) errHandle(response,realPath);
        	else {
                if (stats.isDirectory()) {
				    if (pathname.slice(-1) != "/") {
				        pathname = pathname + "/";
				    }
                    response.setHeader("Content-Type","text/html; charset=utf-8");
                    var parent = path.dirname(pathname),
                    	css = '<style>li{list-style:none;} .folder a{color:#3a3;} .file a{color:rgb(0,0,238);} li span{margin:auto 10px; display:inline-block; min-width:100px;} li a{display:inline-block;min-width:300px;} a{text-decoration:none;}</style>',
                    	cont = "<ul>";
                    if(pathname!='/') cont += "<li><a href='/' style='color:red;'>::Root::(/)</li><li><a href='"+parent+"' style='color:red;'>::Parent::(../)</li>";
					fs.readdir(realPath, function (err, files) { // '/' denotes the root folder
						if (err) errHandle(pathname);
						files.forEach(function(file){
							try{
								stats = fs.lstatSync(path.join(realPath,file));
								if(stats.isDirectory()) { //conditing for identifying folders
									cont += '<li class="folder"><a href="'+pathname+file+'">['+file+']</a></span><span>Size: []</span><span>Modified: '+stats.mtime.toISOString()+'</span></li>';
								}
								else{
									cont += '<li class="file"><a href="'+pathname+file+'">'+file+'</a><span>Size: '+stats.size+'</span><span>Modified: '+stats.mtime.toISOString()+'</span></li>';
								}
							}catch(e){}
						});
						cont += "</ul>";
						response.write(css + cont);
						response.end();
					});
                } else {
                    var ext = path.extname(realPath);
                    ext = ext ? ext.slice(1) : 'unknown';
                    var contentType = mime[ext] || "text/plain";
                    response.setHeader("Content-Type", contentType);
                    response.setHeader('Content-Length', stats.size);

                    var lastModified = stats.mtime.toUTCString();
                    var ifModifiedSince = "If-Modified-Since".toLowerCase();
                    response.setHeader("Last-Modified", lastModified);

                    if (ext.match(config.Expires.fileMatch)) {
                        var expires = new Date();
                        expires.setTime(expires.getTime() + config.Expires.maxAge * 1000);
                        response.setHeader("Expires", expires.toUTCString());
                        response.setHeader("Cache-Control", "max-age=" + config.Expires.maxAge);
                    }

                    if (request.headers[ifModifiedSince] && lastModified == request.headers[ifModifiedSince]) {
                        response.writeHead(304, "Not Modified");
                        response.end();
                    } else {
                        var compressHandle = function (raw, statusCode, reasonPhrase) {
                                var stream = raw;
                                var acceptEncoding = request.headers['accept-encoding'] || "";
                                var matched = ext.match(config.Compress.match);

                                if (matched && acceptEncoding.match(/\bgzip\b/)) {
                                    response.setHeader("Content-Encoding", "gzip");
                                    stream = raw.pipe(zlib.createGzip());
                                } else if (matched && acceptEncoding.match(/\bdeflate\b/)) {
                                    response.setHeader("Content-Encoding", "deflate");
                                    stream = raw.pipe(zlib.createDeflate());
                                }
                                response.writeHead(statusCode, reasonPhrase);
                                stream.pipe(response);
                            };

                        if (request.headers["range"]) {
                            var range = utils.parseRange(request.headers["range"], stats.size);
                            if (range) {
                                response.setHeader("Content-Range", "bytes " + range.start + "-" + range.end + "/" + stats.size);
                                response.setHeader("Content-Length", (range.end - range.start + 1));
                                var raw = fs.createReadStream(realPath, {"start": range.start, "end": range.end});
                                compressHandle(raw, 206, "Partial Content");
                            } else {
                                response.removeHeader("Content-Length");
                                response.writeHead(416, "Request Range Not Satisfiable");
                                response.end();
                            }
                        } else {
                            var raw = fs.createReadStream(realPath);
                            compressHandle(raw, 200, "Ok");
                        }
                    }
                }
            }
        });
    },
    errHandle=function(pathname){
	    response.writeHead(404, "Not Found", {'Content-Type': 'text/html'});
	    var ref = request.headers['referer'];
	    if(ref) response.write("<a href='"+ref+"'>back</a><br/>");
	    response.write("This request URL " + pathname + " was not found on this server.");
	    response.end();
    };

    pathHandle(realPath);
});

server.listen(PORT);
console.log("Server running at port: " + PORT + ".");