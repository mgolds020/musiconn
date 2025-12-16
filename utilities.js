//requires
require('dotenv').config();
const fs = require('fs');
const mongo = require('mongodb');
const jwt = require('jsonwebtoken');

const MongoClient = mongo.MongoClient;

function manageCollection(res, coll, callback) {

        MongoClient.connect(process.env.CONNECTION_STRING, (err, client) => {
        // error handling
        if(err) {
            console.log(`Connection Error: ${err}`);   
            return jsonResponse(res, 500, { error: 'Database Connection Error' });
        }

        // select user collection from our final project database
        const dbo = client.db('FinalProject');
        const collection = dbo.collection(coll);

        // call the callback function
        callback(res, collection, client);
    });
}

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

module.exports = {
    loadFile,
    jsonResponse,
    authenticateToken,
    manageCollection
}

