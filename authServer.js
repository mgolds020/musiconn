// TODO token authentication as 'middleware' implimented in pure node

// requires
require('dotenv').config();
const http = require('http');
const urlObj = require('url');
const qs = require('querystring'); // parsing for post
const fs = require('fs');
const mongo = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// connecting and serving information
const PORT = 8080;

const MongoClient = mongo.MongoClient;

http.createServer((req, res) => {
    // res.writeHead(200, {'Content-Type': 'text/html'});
    const path = urlObj.parse(req.url).pathname;

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
            
            manageUsersCollection(res, (res, collection, client) => {
                
                collection.findOne({username: usernameEntered}, (err, user) => {

                    if(err) {
                        console.log(`Error qeurying: ${err}`);
                        jsonResponse(res, 500, { error: 'Database Error' });
                        client.close();
                        return;
                    }

                    if (user) {
                        console.log("Username Already Exists");
                        jsonResponse(res, 403, { error: 'Forbidden' });
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
                            res.writeHead(303, {Location: '/login'});
                            res.end('');
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

            manageUsersCollection(res, (res, collection, client) => {
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
                    const refreshToken = jwt.sign(tokenPayload, process.env.REFRESH_TOKEN_SECRET);
                    
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
                        jsonResponse(res, 200, {
                            message: 'Login Success',
                            accessToken: accessToken,
                            refreshToken: refreshToken
                        });

                        client.close();

                    });

                });
            });
        });

    } else if (path === "/token" && req.method == 'POST') {
        let myFormData = '';
        req.on('data', newData => { myFormData += newData.toString(); });
        req.on('end', () => {
            const parsedData = qs.parse(myFormData);
            const refreshToken = parsedData.token;

            // TO DO: Should Ilog out? 
            if(refreshToken == null) return jsonResponse(res, 401, { error: 'Unauthorized: invalid refresh token' });

            


        })

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

function manageUsersCollection(res, callback) {

        MongoClient.connect(process.env.CONNECTION_STRING, (err, client) => {
        // error handling
        if(err) {
            console.log(`Connection Error: ${err}`);   
            return jsonResponse(res, 500, { error: 'Database Connection Error' });
        }

        // select user collection from our final project database
        const dbo = client.db('FinalProject');
        const collection = dbo.collection('users');

        // call the callback function
        callback(res, collection, client);
    });
}

/**
 * Helper function for sending json replacing express's res.json (with less input flexibility)
 */
function jsonResponse(res, status, data) {
    res.writeHead(status, { 'Content-type': 'application/json' });

    res.end(JSON.stringify(data ?? {}));
}

function generateAccessToken(payload) {
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m'});
}