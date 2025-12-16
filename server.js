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

    // Serve files for assets requested by pages (css/js/images)
    // Example: browser requests /styles/map.css -> serve ./styles/map.css
    if (path && (path.startsWith('/styles/') || path.startsWith('/scripts/') || path.startsWith('/images/') || path.match(/\.(css|js|png|jpg|jpeg|svg)$/))) {
        const staticPath = path.slice(1); // remove leading '/'
        fs.readFile(staticPath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not found');
                return;
            }

            let contentType = 'application/octet-stream';
            if (staticPath.endsWith('.css')) contentType = 'text/css';
            else if (staticPath.endsWith('.js')) contentType = 'application/javascript';
            else if (staticPath.endsWith('.png')) contentType = 'image/png';
            else if (staticPath.endsWith('.jpg') || staticPath.endsWith('.jpeg')) contentType = 'image/jpeg';
            else if (staticPath.endsWith('.svg')) contentType = 'image/svg+xml';

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
        return;
    }

    if (path === "/" && req.method === "GET") {

        loadFile("views/map.html", res);

    } else if (path === "/login" && req.method === "GET") {

        loadFile("views/login.html", res);

    } else if (path === "/signup" && req.method === "GET") {

        loadFile("views/signup.html", res);

    } else if (path === "/gigs" && req.method === "GET") {

        loadFile("views/gigs.html", res);

    } else if (path === "/profile" && req.method === "GET") {

        loadFile("views/profile.html", res);

    } else if (path === "/users" && req.method === "GET") {
        //authenticateToken(req, res, () => {
            const qObj = urlObj.parse(req.url, true).query;
            const username = (qObj.username || "").trim();

            if (!username) return jsonResponse(res, 400, { error: "Missing username" });

            manageCollection(res, "users", (res, collection, client) => {
            collection.findOne({ username }, (err, user) => {
                if (err) {
                console.log(`Error querying: ${err}`);
                client.close();
                return jsonResponse(res, 500, { error: "Database query error" });
                }

                if (!user) {
                client.close();
                return jsonResponse(res, 404, { error: "No such User Exists" });
                }

                const publicUser = toPublicUser(user);
                client.close();
                return jsonResponse(res, 200, publicUser);
            });
            });
        //});


        // loadFile("views/profile.html", res);
    } else if (path === "/map" && req.method === "GET") {
        loadFile("views/map.html", res);
    } else if (path === "/posts" && req.method === "POST") {
        
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

<<<<<<< Updated upstream
=======
    } else if (path === "/posts" && req.method === 'GET') {
        const qObj = urlObj.parse(req.url, true).query;
        const idRaw = qObj.userid;
        if (!idRaw) return jsonResponse(res, 400, { error: "Bad Request: Missing User ID"});
        const userId = new mongo.ObjectId(idRaw);
        manageCollection(res, 'posts', (res, collection, client) => {
            collection.find({ authorId: userId }).toArray((err, posts) => {
                if(err) {
                    console.log("Query Error: " + err);
                    client.close();
                    return jsonResponse(res, 500, {error: "Database Query Error"});
                }

                console.log("posts query returned", posts.length, "documents");
                console.log(posts.map(e => ({
                    title: e.title,
                    description: e.description
                })));
                
                jsonResponse(res, 200, posts);
                client.close();
            });
        });
        

>>>>>>> Stashed changes
    } else if (path === '/posts/delete' && req.method === 'POST' ) {
        let myFormData = '';
        req.on('data', newData => { myFormData += newData.toString(); });
        // end = event when data stops being sent
        req.on('end', () => {
            const parsedData = qs.parse(myFormData);
            const postId = new mongo.ObjectId(parsedData.postId);
            authenticateToken(req, res, (tokenInfo) => {
                manageCollection(res, 'posts', (res, collection, client) => {
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

                        if(post.authorId.toString() !== tokenInfo.sub) {
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
    } else if (path === '/posts/create' && req.method === 'POST') {
        let myFormData = '';
        req.on('data', newData => { myFormData += newData.toString(); });
        // end = event when data stops being sent
        req.on('end', () => {
            const postData = qs.parse(myFormData).post;

            const post = createPostObject(res, postData);
            if (!post) return jsonResponse(res, 400, { error: 'Unable to create post'});

            authenticateToken(req, res, (tokenInfo) => {
                manageCollection(res, 'posts', (res, collection, client) => {

                    const userId = tokenInfo.sub;
                    post.authorId = new mongo.ObjectId(userId);

                    collection.insertOne(post, (err) => {

                        if(err) {
                            console.log(`Insertion error: ${err}`);
                            client.close();
                            return jsonResponse(res, 500, { error: 'Error Creating User'})
                        }

                        console.log("Post successfully created");
                        client.close();
                        return jsonResponse(res, 201, { message: "Post created" });
                        
                    });
                });
            });
        });
    } else {
        res.writeHead(303, {Location: '/'});
        res.end('');
    }

}).listen(PORT);


// function to validate and return a post object in the correct format

function createPostObject(res, post) {

    // required fields
    const type = String(post?.type ?? '').trim();
    const title = String(post?.title ?? '').trim();
    const description = String(post?.description ?? '').trim();
    const latitude = Number(post?.latitude);
    const longitude = Number(post?.longitude);

    // validation on required fields
    const allowedTypes = new Set(['gig', 'event', 'lesson']);

    if (!allowedTypes.has(type)) {
        jsonResponse(res, 400, { error: 'Invalid type', allowed: Array.from(allowedTypes) });
        return null;
    }
    if (!title){
        jsonResponse(res, 400, { error: 'Missing title' });
        return null;
    };
    if (!description){ 
        jsonResponse(res, 400, { error: 'Missing description' });
        return null;
    };
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        jsonResponse(res, 400, { error: 'Invalid latitude/longitude' });
        return null;
    }

    // Optional fields - set null if not POSTed
    const address = post?.address ? String(post.address).trim() : '';
    const priceLowBound = post?.priceLowBound != null ? Number(post.priceLowBound) : null;
    const priceHighBound = post?.priceHighBound != null ? Number(post.priceHighBound) : null;

    // optionally accept and validate event date
    const eventDate = post?.eventDate ? new Date(post.eventDate) : null;

    if (post?.eventDate && isNaN(eventDate.getTime())) {
        jsonResponse(res, 400, { error: 'Invalid eventDate' });
        return null;
    }

    const newPost = {
        type: type,
        title: title,
        description: description,
        datePosted: new Date(),
        address: address,
        priceLowBound: priceLowBound,
        priceHighBound: priceHighBound,
        location: {
            type: 'Point',
            coordinates: [longitude, latitude]
        }
    };

    if (eventDate) newPost.eventDate = eventDate;

    return newPost;
}

function toPublicUser(user) {
  if (!user) return null;

  const base = {
    _id: user._id.toString?.(), // Potentially put back ?:??id  
    username: user.username ?? "",
    role: user.role ?? "listener",
    bio: user.bio ?? "",
    contactInfo: {
      email: user?.contactInfo?.email ?? "",
    },
    createdAt: user.createdAt ?? null,
  };

  if (base.role === "artist" && user.artistProfile) {
    base.artistProfile = {
      legalName: user.artistProfile.legalName ?? "",
      stageName: user.artistProfile.stageName ?? "",
      isInstructor: !!user.artistProfile.isInstructor,
      genres: Array.isArray(user.artistProfile.genres) ? user.artistProfile.genres : [],
      media: Array.isArray(user.artistProfile.media) ? user.artistProfile.media : [],
      instrument: user.artistProfile.instrument ?? "",
      status: user.artistProfile.status ?? "",
    };
  }

  if (base.role === "band" && user.bandProfile) {
    base.bandProfile = {
      name: user.bandProfile.name ?? "",
      genres: Array.isArray(user.bandProfile.genres) ? user.bandProfile.genres : [],
      members: Array.isArray(user.bandProfile.members) ? user.bandProfile.members : [],
      media: Array.isArray(user.bandProfile.media) ? user.bandProfile.media : [],
      status: user.bandProfile.status ?? "",
      admins: Array.isArray(user.bandProfile.admins) ? user.bandProfile.admins : [],
    };
  }

  // listener: no artistProfile/bandProfile attached
  return base;
}