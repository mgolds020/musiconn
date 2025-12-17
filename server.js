// TODO token authentication as 'middleware' implimented in pure node

// requires
require('dotenv').config();
const http = require('http');
const urlObj = require('url');
const bcrypt = require('bcrypt');
const qs = require('querystring'); // parsing for post
const fs = require('fs');
const mongo = require('mongodb');
const jwt = require('jsonwebtoken');

const { loadFile, authenticateToken, jsonResponse, manageCollection } = require('./utilities');

// connecting and serving information
const PORT = process.env.PORT || 3000;

// allow CORS requests from the client server
function handleCORS(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  // Preflight request
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

http.createServer((req, res) => {

    if (handleCORS(req, res)) return;

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

       if (path === '/signup' && req.method === 'GET') {
        
        // render the signup view
        loadFile('views/signup.html', res);

    } else if(path === '/signup' && req.method === 'POST') {

        let myFormData = '';

        // handle new user Post data
        req.on('data', newData => { myFormData += newData.toString(); });
        req.on('end', () => {
            
            // grab auth form input
            const parsedData = qs.parse(myFormData);
            const usernameEntered = parsedData.username;
            const passwordEntered = parsedData.password;
            
            if(usernameEntered == '' || passwordEntered == '') {
                console.log("Error: one or more fields is empty");
                return jsonResponse(res, 400, { error: 'Bad Input' });
            }

            const hashedPass = bcrypt.hashSync(passwordEntered, 10);
            
            manageCollection(res, 'users', (res, collection, client) => {
                
                collection.findOne({username: usernameEntered}, (err, user) => {

                    if(err) {
                        console.log(`Error qeurying: ${err}`);
                        jsonResponse(res, 500, { error: 'Database Error' });
                        client.close();
                        return;
                    }

                    if (user) {
                        console.log("Username Already Exists");
                        jsonResponse(res, 409, { error: 'Username already exists' });
                        client.close();
                        return;
                    }

                    collection.insertOne({username: usernameEntered, password: hashedPass}, (err) => {

                        if(err) {
                            console.log(`Insertion error: ${err}`);
                            jsonResponse(res, 500, { error: 'Error Creating User'})
                        } else {
                            // redirect user to log in page
                            console.log("User successfully created, redirecting to login page");
                            jsonResponse(res, 201, { message: "User created" });
                            client.close();
                            return;
                        }

                        client.close();

                    });
                });
            });
        });

    } else if (path === '/login' && req.method === 'GET') {

        // render the log-in view
        loadFile('views/login.html', res);

    } else if (path === '/login' && req.method === 'POST') {
        let myFormData = '';

        req.on('data', newData => { myFormData += newData.toString(); });
        req.on('end', () => {

            // grab auth form input
            const parsedData = qs.parse(myFormData);
            const usernameEntered = parsedData.username;
            const passwordEntered = parsedData.password;

            if(usernameEntered == '' || passwordEntered == '') {
                console.log("Error: one or more fields is empty");
                return jsonResponse(res, 400, { error: 'Bad Input' });
            }

            manageCollection(res, 'users', (res, collection, client) => {
                // find the user in our database
                collection.findOne({username: usernameEntered}, (err, dbUser) => {

                    if(err) {
                        console.log(`Error qeurying: ${err}`);
                        jsonResponse(res, 500, { error: 'database query error' });
                        client.close();
                        return;
                    }

                    if (!dbUser) {
                        console.log(`Invalid Username`);
                        jsonResponse(res, 401, { error: 'Invalid Username'});
                        client.close();
                        return;
                    }

                    const passwordMatch = bcrypt.compareSync(passwordEntered, dbUser.password);

                    // check if user password = the stored password
                    if(!passwordMatch) {
                        console.log('Incorrect password');
                        jsonResponse(res, 401, { error: 'Incorrect Password'});
                        client.close();
                        return;
                    }

                    // if we make it here, user credentials are valid

                    // create an object with the fields we want to sign with our secret key
                    const tokenPayload = {
                        sub: dbUser._id.toString(),
                        username: dbUser.username,
                    }

                    // create tokens
                    const accessToken = generateAccessToken(tokenPayload);
                    const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
                    
                    // store the refresh token with this user in the database
                    collection.updateOne({ _id: dbUser._id }, { $set: { refreshToken: refreshToken} }, (err) => {
                        if (err) {
                            console.log("ERROR: cannot save refresh token"); 
                            // TO DO: should log the user out?
                            jsonResponse(res, 500, { error: 'Error saving refresh token'}); 
                            client.close();
                            return;
                        } 

                        // send encrypted tokens to the front end
                        setRefreshCookie(res, refreshToken);

                        res.writeHead(200, {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "http://localhost:3000",
                            "Access-Control-Allow-Credentials": "true",
                        });
                        res.end(JSON.stringify({
                            message: "Login Success",
                            accessToken: accessToken
                        }));

                        client.close();
                        return;
                    });

                });
            });
        });

    } else if (path === "/token" && req.method == 'POST') {

        // read refresh token from cookie (preferred)
        const cookies = parseCookies(req);
        const refreshToken = cookies.refreshToken;

        if (!refreshToken) {
            res.writeHead(303, {Location: '/login'});
            res.end('');
            return;
        }

        let payload;
        try {
            payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        } catch (e) {
            return jsonResponse(res, 403, { error: "Forbidden: invalid refresh token" });
        }

        manageCollection(res, 'users', (res, collection, client) => {
            
            collection.findOne({ _id: new mongo.ObjectId(payload.sub)}, (err, dbUser) => {
                if (err || !dbUser) {
                    client.close();
                    return jsonResponse(res, 401, { error: "Unauthorized" });
                }

                if (dbUser.refreshToken !== refreshToken) {
                    client.close();
                    return jsonResponse(res, 403, { error: "Forbidden: token mismatch" });
                }

                // issue a new access token
                const newAccessToken = generateAccessToken({
                    sub: dbUser._id.toString(),
                    username: dbUser.username
                });

                client.close();
                return jsonResponse(res, 200, { accessToken: newAccessToken });
            });
        });

    } else if (path === '/logout' && req.method === 'GET') {
        const qObj = urlObj.parse(req.url, true).query;
        const username = qObj.username;
        console.log(username);
        if (!username) return jsonResponse(res, 400, { error: "No user provided"});
        manageCollection(res, 'users', (res, collection, client) => {
            collection.updateOne({ username: username }, { $unset: { refreshToken: '' }}, (err) => {
                if(err) {
                    console.log("Error Logging out");
                    client.close();
                    return jsonResponse(res, 500, { error: "Server Error: Logout" });
                }
                
                client.close();
                res.writeHead(303, {Location: '/login'});
                res.end('');
                return;
            });
        });
    } else if (path === "/" && req.method === "GET") {
        
        loadFile("views/map.html", res);

    } else if (path === "/login" && req.method === "GET") {

        loadFile("views/login.html", res);

    } else if (path === "/signup" && req.method === "GET") {

        loadFile("views/signup.html", res);

    } else if (path === "/gigs" && req.method === "GET") {
        
        loadFile("views/gigs.html", res);
   

    } else if (path === "/profile" && req.method === "GET") {
    
        loadFile("views/profile.html", res);
    
    
    } else if (path === "/editprofile" && req.method === "GET") {
        
        loadFile("views/edit-profile.html", res);
        

    } else if (path === "/users" && req.method === "GET") {
        authenticateToken(req, res, () => {
            const qObj = urlObj.parse(req.url, true).query;
            const username = (qObj.username || "").trim();

            if (!username) return jsonResponse(res, 400, { error: "Missing username" });

            manageCollection(res, "users", (res, collection, client) => {
                collection.findOne({ username: username }, (err, user) => {
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
        });


        // loadFile("views/profile.html", res);
    } else if (path === "/users" && req.method === 'PUT') {
        authenticateToken(req, res, (tokenInfo) => {
            let myFormData = '';
            req.on('data', newData => { myFormData += newData.toString(); });
            req.on('end', () => {
                let body = {};

                try {
                    body = myFormData ? JSON.parse(myFormData) : {};
                } catch {
                    return jsonResponse(res, 400, { error: "Invalid JSON" });
                }

                
                const username = body.username;
                if(username !== tokenInfo.username) return jsonResponse(res, 400, { error: "Bad Request: Cannot Edit Another User's Profile "});

                const userId = new mongo.ObjectId(tokenInfo.sub);

                manageCollection(res, 'users', (res, collection, client) => {
                    collection.findOne({ _id: userId }, (err, dbUser) => {
                        if (err) {
                            console.log("Error querying user: " + err);
                            client.close();
                            return jsonResponse(res, 500, { error: "Error Querying User"});
                        }

                        if (!dbUser) {
                            console.log("Error querying user: " + err);
                            client.close();
                            return jsonResponse(res, 404, { error: `No such user: ${username}`});
                        }

                        const query = createUserUpdateQuery(res, body, dbUser);
                        if (query == null) {
                            console.log(`Error Updating ${username}'s profile`);
                            client.close();
                            return jsonResponse(res, 400, { error: `No valid fields to update`});
                        }

                        collection.updateOne({ _id: userId }, query.update, (err) => {
                            if(err) {
                                console.log("Error updating user");
                                client.close();
                                return jsonResponse(res, 500, { error: "Server Error Updating user" });
                            }
                            
                            client.close();

                            return jsonResponse(res, 200, { status: "sucess" });

                        });

                    });
                });
            });
        });

    } else if (path === "/map" && req.method === "GET") {
        
        loadFile("views/map.html", res);

    } else if (path === '/makepost' && req.method === 'GET' ) {
        
        loadFile("views/makepost.html", res);
        

    } else if (path === '/post' && req.method === 'GET' ) {

        loadFile("views/post.html", res);
        

    } else if (path === '/post/id' && req.method === 'GET' ) {
        
            const qObj = urlObj.parse(req.url, true).query;
            const idRaw = qObj.postid;
            if (!idRaw) return jsonResponse(res, 400, { error: "Bad Request: Missing User ID"});
            const postId = new mongo.ObjectId(idRaw);
            manageCollection(res, 'posts', (res, collection, client) => {
                collection.findOne({ _id: postId }, (err, post) => {

                    if(err) {
                        console.log("Query Error: " + err);
                        client.close();
                        return jsonResponse(res, 500, {error: "Database Query Error"});
                    }

                    if(!post) {
                        console.log("Error: this post does not exist");
                        client.close();
                        return jsonResponse(res, 404, {error: `No post Exists with ID ${postId}` });
                    }

                    post._id = post._id.toString();
                    
                    jsonResponse(res, 200, post);
                    client.close();
                });
            });

    }else if (path === "/posts" && req.method === "POST") {
        authenticateToken(req, res, (tokenInfo) => {
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
        });

    } else if (path === "/posts" && req.method === 'GET') { // OPTIONAL TODO: Maybe if they dont specify a user they get returned their OWN posts
        authenticateToken(req, res, (tokenInfo) => {
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

                    //stringify post IDs
                    posts.forEach(post => post._id = post._id.toString());
                    
                    jsonResponse(res, 200, posts);
                    client.close();
                });
            });
        });      
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
              console.log("========== INCOMING REQUEST ==========");
                console.log("METHOD:", req.method);
                console.log("URL:", req.url);
                console.log("HEADERS:", req.headers);
                console.log("RAW BODY:", myFormData);
                console.log("======================================");

            const parsedData = qs.parse(myFormData);
            console.log("PARSED form data:", parsedData);

            const postJson = parsedData.post;
            if (!postJson) return jsonResponse(res, 400, { error: "Missing post field" });

            let postData;
            try {
                postData = JSON.parse(postJson);
            } catch (e) {
                return jsonResponse(res, 400, { error: "post must be valid JSON" });
            }

            const post = createPostObject(res, postData);

            if (post == null) return /*jsonResponse(res, 400, { error: 'Unable to create post'})*/;
            console.log("POST:" + JSON.stringify(post));

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
        res.writeHead(303, {Location: '/login'});
        res.end('');
    }

}).listen(PORT);

// function to validate and return a post object in the correct format

function createPostObject(res, post) {

    // required fields
    const type = String(post?.type ?? '').trim();
    const title = String(post?.title ?? '').trim();
    const author = String(post?.author ?? '').trim();
    const description = String(post?.description ?? '').trim();
    const latitude = Number(post?.latitude);
    const longitude = Number(post?.longitude);

    // validation on required fields
    const allowedTypes = new Set(['gig', 'jam', 'lesson']);

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
    if (!author) {
        jsonResponse(res, 400, { error: 'No Author provided' });
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
        author: author,
        description: description,
        datePosted: new Date(),
        address: address,
        priceLowBound: Number(priceLowBound),
        priceHighBound: Number(priceHighBound),
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
      name: user?.contactInfo?.name ?? "",
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
      members: user.bandProfile.members ?? 0,
      media: Array.isArray(user.bandProfile.media) ? user.bandProfile.media : [],
      status: user.bandProfile.status ?? "",
      admins: Array.isArray(user.bandProfile.admins) ? user.bandProfile.admins : [],
    };
  }

  // listener: no artistProfile/bandProfile attached
  return base;
}

function createUserUpdateQuery(res, body, existingUser) {
    const allowedRoles = new Set(["listener", "artist", "band"]);

    const $set = {};
    const $unset = {};

    const newRole = body.role;
    if(newRole && !allowedRoles.has(newRole)) {
        jsonResponse(res, 400, { error: `Bad Request: Invalid Role - ${newRole}` });
        return null;
    } else if (newRole && newRole !== existingUser.role) {
        $set.role = newRole;
        switch(newRole) {
            case 'listener': {
                if(existingUser.bandProfile) $unset.bandProfile = "";
                if(existingUser.artistProfile) $unset.artistProfile = "";
                break;
            }
            case 'artist': {
                if(existingUser.bandProfile) $unset.bandProfile = "";
                if(body.artistProfile) $set.artistProfile = body.artistProfile;
                break;
            }
            case 'band': {
                if(existingUser.artistProfile) $unset.artistProfile = "";
                if(body.bandProfile) $set.bandProfile = body.bandProfile;
                break;
            }
        }
    } else if (newRole && newRole === existingUser.role) {
        switch(newRole) {
            case 'artist': {
                if (body.artistProfile) updateArtistProfile($set, existingUser.artistProfile, body.artistProfile);
                break;
            }
            case 'band': {
                if (body.bandProfile) updateBandProfile($set, existingUser.bandProfile, body.bandProfile);
                break;
            }
        }
    }

    const newContactInfo = body.contactInfo;
    if(newContactInfo) updateContactInfo($set, existingUser.contactInfo, newContactInfo);

    const newBio = body.bio;
    if(newBio && newBio !== existingUser.bio) $set.bio = newBio;

    if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
        return null;
    }

    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;

    return { update };

}

function updateArtistProfile($set, oldProf, newProf) {
    if(newProf.legalName && oldProf.legalName !== newProf.legalName) $set["artistProfile.legalName"] = newProf.legalName;
    if(newProf.stageName && oldProf.stageName !== newProf.stageName) $set["artistProfile.stageName"] = newProf.stageName;
    if(typeof newProf.isInstructor === "boolean" && oldProf.isInstructor !== newProf.isInstructor) $set["artistProfile.isInstructor"] = newProf.isInstructor;
    if(newProf.genres && sameArray(oldProf.genres && newProf.genres)) $set["artistProfile.genres"] = newProf.genres;
    if(newProf.media && oldProf.media !== newProf.media) $set["artistProfile.media"] = newProf.media;
    if(newProf.instrument && oldProf.instrument !== newProf.instrument) $set["artistProfile.instrument"] = newProf.instrument;
    if(newProf.status && oldProf.status !== newProf.status) $set["artistProfile.status"] = newProf.status;
}

function updateBandProfile($set, oldProf, newProf) {
    if(newProf.name && oldProf.name !== newProf.name) $set["bandProfile.name"] = newProf.name;
    if(newProf.genres && oldProf.genres !== newProf.genres) $set["bandProfile.genres"] = newProf.genres;
    if(newProf.members && oldProf.members !== newProf.members) $set["bandProfile.members"] = newProf.members;
    if(newProf.status && oldProf.status !== newProf.status) $set["bandProfile.status"] = newProf.status;
}

function updateContactInfo($set, oldProf = {}, newProf = {}) {
    if(newProf.email && (oldProf.email !== newProf.email)) $set["contactInfo.email"] = newProf.email;
    if(newProf.name && (oldProf.name !== newProf.name)) $set["contactInfo.name"] = newProf.name;
}

const sameArray = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);


function generateAccessToken(payload) {
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m'});
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  header.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    out[k] = decodeURIComponent(v.join("="));
  });
  return out;
}

function setRefreshCookie(res, refreshToken) {
  // For local dev over http, omit Secure. In production over https, add Secure.
  const cookie = [
    `refreshToken=${encodeURIComponent(refreshToken)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Secure=true",
    "Path=/",
    // "Secure", // enable when serving over https
    // "Max-Age=604800" // optional: 7 days
  ].join("; ");
  res.setHeader("Set-Cookie", cookie);
}

function clearRefreshCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "refreshToken=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  );
}