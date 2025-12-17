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

const { loadFile, jsonResponse, manageCollection } = require('./utilities');

// connecting and serving information
const PORT = 8080;

http.createServer((req, res) => {
    // res.writeHead(200, {'Content-Type': 'text/html'});

    

 

}).listen(PORT);
