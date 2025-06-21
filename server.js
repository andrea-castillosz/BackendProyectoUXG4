require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();

let parser = bodyParser.urlencoded({ extended: true });
var corsOptions = {
    origin: '*'
}
let corsPolicy = cors(corsOptions);

app.use(parser);
app.use(corsPolicy);
app.use(bodyParser.json());

const port = process.env.PORT;
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
}
);

async function run() {
    try {
        await client.connect();
        console.log("Conectados a la DB")
    } catch (error) {
        console.log(error);
    }
}

app.listen(port, () => {
  console.log(` Servidor corriendo en puerto ${port}`);
  run();
});