// TODO token authentication as 'middleware' implimented in pure node

// requires
require('dotenv').config();
const http = require('http');
const urlObj = require('url');
const qs = require('querystring'); // parsing for post
const fs = require('fs');
const mongo = require('mongodb');
const jwt = require('jsonwebtoken');

const { loadFile, authenticateToken, jsonResponse, manageCollection } = require('./utilities');

// connecting and serving information
const PORT = 3000;

http.createServer((req, res) => {
    // res.writeHead(200, {'Content-Type': 'text/html'});
    const path = urlObj.parse(req.url).pathname;

    if (path === "/" && req.method === "GET") {
        loadFile("views/map.html", res);
    } else if (path === "/login" && req.method === "GET") {
        loadFile("views/login.html", res);
    } else if (path === "/signup" && req.method === "GET") {
        loadFile("views/signup.html", res);
    } else if (path === "/gigs" && req.method === "GET") {
        loadFile("views/gigs.html", res);
    } else if (path === "/users" && req.method === "GET") {

        authenticateToken(req, res, (tokenPayload) => {
            const qObj = urlObj.parse(req.url, true).query;
            const username = qObj.username;
            
            manageCollection(res, 'users', (res, collection, client) => {
                collection.findOne( { username: username }, (err, user) => {
                    if(err) {
                        console.log(`Error qeurying: ${err}`);
                        jsonResponse(res, 500, { error: 'Database query error' });
                        client.close();
                        return;
                    }

                    if (!user) {
                        console.log(`Invalid Post Id`);
                        jsonResponse(res, 403, { error: 'No such User Exists'});
                        client.close();
                        return;
                    }

                    jsonResponse(res, 200, user);
                    res.write(user);
                    client.close();
                });
            });
        });

        // loadFile("views/profile.html", res);
    } else if (path === "/map" && req.method === "GET") {
        loadFile("views/map.html", res);

    } else if (path === "/map" && req.method === "POST") {
        let myFormData = '';
        req.on('data', newData => { myFormData += newData.toString(); });
        // end = event when data stops being sent
        req.on('end', () => {
            let body;
            try {
                body = JSON.parse(myFormData);
            } catch {
                return jsonResponse(res, 400, { error: "Invalid JSON" });
            }

            const lon = Number(body?.location?.coordinates?.[0]);
            const lat = Number(body?.location?.coordinates?.[1]);
            const miles = Number(body?.distanceMiles ?? 20);
            const distance = miles / 3958.8; // miles → radians
            const types = body?.types;

            if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                return jsonResponse(res, 400, {
                    error: "Invalid coordinates",
                    received: body
                });
            }

            // pre-build the query, conditionally filtering event type
            const query = {
                location: {
                    $geoWithin: {
                        $centerSphere: [
                            [lon, lat],
                            distance
                        ]
                    }
                }
            }

            if(Array.isArray(types) && types.length > 0) {
                query.type = { $in: types };
            }

            // run a geospatial query returning
            manageCollection(res, 'posts', (res, collection, client) => {
                collection.find(query).toArray((err, events) => {
                    if(err) {
                        console.log("Query Error: " + err);
                        client.close();
                        return jsonResponse(res, 500, {error: "Database Query Error"});
                    }
                    
                    console.log("Geo query returned", events.length, "documents");
                    console.log(events.map(e => ({
                        title: e.title,
                        coords: e.location?.coordinates
                    })));

                    jsonResponse(res, 200, events);
                    client.close();
                });
            });
      
        });

    } else if (path === '/deletePost' && req.method === 'POST' ) {
        let myFormData = '';
        req.on('data', newData => { myFormData += newData.toString(); });
        // end = event when data stops being sent
        req.on('end', () => {
            const parsedData = qs.parse(myFormData);
            const postId = parsedData.postId;
            authenticateToken(req, res, (tokenInfo) => {
                manageCollection(res, 'posts', (res, collection, client) => {
                    collection.findOne( { _id: new mongo.objectId(postId) }, (err, post) => {

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

                        if(post.authorId.toString() !== tokenInfo.sub) {
                            console.log(`User ${tokenInfo.username} tried to delete someone else's post`);
                            jsonResponse(res, 401, { error: 'Unauthorized Delete' });
                            client.close();
                            return;
                        }
                        
                        collection.deleteOne( { _id: new mongo.objectId(postId) }, (err, result) => {
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


