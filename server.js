// TODO token authentication as 'middleware' implimented in pure node

// requires
require('dotenv').config();
const http = require('http');
const urlObj = require('url');
const qs = require('querystring'); // parsing for post
const fs = require('fs');
const mongo = require('mongodb');
const jwt = require('jsonwebtoken');

// connecting and serving information
const PORT = 3000;

const MongoClient = mongo.MongoClient;

http.createServer((req, res) => {
    // res.writeHead(200, {'Content-Type': 'text/html'});
    const path = urlObj.parse(req.url).pathname;

    if (path === "/" && req.method === "GET") {
        loadFile("views/homepage.html", res);
    } else if (path === "/login" && req.method === "GET") {
        loadFile("views/login.html", res);
    } else if (path === "/signup" && req.method === "GET") {
        loadFile("views/signup.html", res);
    } else if (path === "/profile" && req.method === "GET") {
        loadFile("views/profile.html", res);
    } else if (path === "/map" && req.method === "GET") {
        loadFile("views/map.html", res);
    } else if (path === '/deletePost' && req.method === 'POST' ) {
        let myFormData = '';
        req.on('data', newData => { myFormData += newData.toString(); });
        // end = event when data stops being sent
        req.on('end', () => {
            const parsedData = qs.parse(myFormData);
            const postId = parsedData.postId;
            authenticateToken(req, res, (tokenInfo) => {
                managePostsCollection(res, (res, collection, client) => {
                    collection.findOne( { _id: postId }, (err, post) => {

                        if(err) {
                            console.log(`Error qeurying: ${err}`);
                            jsonResponse(res, 500, { error: 'Database query error' });
                            client.close();
                            return;
                        }

                        if (!post) {
                            console.log(`Invalid Post Id`);
                            jsonResponse(res, 403, { error: 'No such Post Exists'});
                            client.close();
                            return;
                        }

                        if(post.authorId !== tokenInfo.sub) {
                            console.log(`User ${tokenInfo.username} tried to delete someone else's post`);
                            jsonResponse(res, 401, { error: 'Unauthorized Delete' });
                            client.close();
                            return;
                        }
                        
                        collection.deleteOne( { _id: postId }, (err, result) => {
                            if(err) {
                                console.log(`Error deleting post: ${err}`);
                                jsonResponse(res, 500, { error: 'Database Delete Error' });
                                client.close();
                                return;
                            }

                            console.log(`Post deleted successfully`);
                            jsonResponse(res, 200, { message: 'Post Deleted Successfully' });
                            client.close();
                        });
                    });
                });
            });
        });
    } else {
        res.writeHead(303, {Location: '/'});
        res.end('');
    }

}).listen(PORT);

/** loadFile
 *  Helper funtion to load/render a file stored at pathname using the fs module
 */
function loadFile(pathname, res) {
    fs.readFile(pathname, (err, fileContents) => {
        if(err) {
            console.log(`ERROR: Cannot read ${pathname}`);
            return jsonResponse(res, 500, { error: 'Cannot Load File or Resource' });
        }
        res.write(fileContents);
        res.end("");
    });
}

/**
 * Helper function for sending json replacing express's res.json (with less input flexibility)
 */
function jsonResponse(res, status, data) {
    res.writeHead(status, { 'Content-type': 'application/json' });
    res.end(JSON.stringify(data ?? {}));
}

/** 
 *  Helper function that authenticates the jwt token implimented
 */
function authenticateToken(req, res, callback) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return jsonResponse(res, 401, { error: "No Token" });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, payload) => {
    if (err) return jsonResponse(res, 403, { error: "Invalid Token" });
    callback(payload);
  });
}


function managePostsCollection(res, callback) {

        MongoClient.connect(process.env.CONNECTION_STRING, (err, client) => {
        // error handling
        if(err) {
            console.log(`Connection Error: ${err}`);   
            return jsonResponse(res, 500, { error: 'Database Connection Error' });
        }

        // select user collection from our final project database
        const dbo = client.db('FinalProject');
        const collection = dbo.collection('posts');

        // call the callback function
        callback(res, collection, client);
    });
}