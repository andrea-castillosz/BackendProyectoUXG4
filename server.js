require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { initializeApp } = require("firebase/app");
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = require("firebase/auth");
const admin = require("firebase-admin");
const axios = require('axios');
const app = express();

let parser = bodyParser.urlencoded({ extended: true });
var corsOptions = {
    origin: '*'
}
let corsPolicy = cors(corsOptions);

app.use(parser);
app.use(corsPolicy);
app.use(bodyParser.json());

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: "G-DYXE485E7T"
};

const firebase = initializeApp(firebaseConfig);
const auth = getAuth(firebase);

admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
  }),
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

const port = process.env.PORT;
const uri = process.env.MONGO_URI;

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
}
);

async function startServer() {
  try {
    await client.connect();
    console.log("Conectados a la DB");

    app.listen(port, () => {
      console.log(`Servidor corriendo en puerto ${port}`);
    });
  } catch (error) {
    console.error("Error al conectar a MongoDB:", error);
    process.exit(1);
  }
}

 function connectDB() {
  return client.db("ProyectoUX");
}

//registrar un usuario
app.post('/RegistrarUsuario', async (req, res) => {
  try {
    const { Email, Contrasena } = req.body;

    const responseFirebase = await createUserWithEmailAndPassword(auth, Email, Contrasena);
    const baseDatos = client.db("ProyectoUX");
    const coleccion = baseDatos.collection("Usuarios");

    const documento = {
      Email: Email,
      firebaseUid: responseFirebase.user.uid,
    };

    await coleccion.insertOne(documento);

    res.status(201).json({
      success: true,
      mensaje: "Usuario creado en Firebase y MongoDB",
      usuario: Email,
      uid: responseFirebase.user.uid,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      mensaje: "Ocurrió un error al registrar el usuario",
      error: error.message,
    });
  }
});

//obtener los usuarios
app.get('/ConseguirUsuario', async (req, res) => {
    try {
        const db = client.db("ProyectoUX");
        const coleccion = db.collection("Usuarios");

        const usuarios = await coleccion.find({}).toArray();

        res.status(200).send({ usuarios });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

//actualizar info de un usuario
app.put('/ActualizarUsuario/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const nuevosDatos = req.body;

    const db = client.db("ProyectoUX");
    const coleccion = db.collection("Usuarios");

    const usuarioActual = await coleccion.findOne({ _id: new ObjectId(id) });
    if (!usuarioActual) {
      return res.status(404).send({ mensaje: "Usuario no encontrado en MongoDB" });
    }

    const firebaseUid = usuarioActual.firebaseUid;

    const actualizaciones = {};
    if (nuevosDatos.Email) actualizaciones.email = nuevosDatos.Email;
    if (nuevosDatos.Contrasena) actualizaciones.password = nuevosDatos.Contrasena;

    if (Object.keys(actualizaciones).length > 0) {
      await admin.auth().updateUser(firebaseUid, actualizaciones);
    }

    const resultado = await coleccion.updateOne(
      { _id: new ObjectId(id) },
      { $set: nuevosDatos }
    );

    res.status(200).send({ mensaje: "Usuario actualizado correctamente en MongoDB y Firebase" });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

//eliminar un usuario
app.delete('/EliminarUsuario/:id', async (req, res) => {
    try {
    const { id } = req.params;
    const db = client.db("ProyectoUX");
    const coleccion = db.collection("Usuarios");

    const usuarioActual = await coleccion.findOne({ _id: new ObjectId(id) });
    if (!usuarioActual) {
      return res.status(404).send({ mensaje: "Usuario no encontrado" });
    }

    await admin.auth().deleteUser(usuarioActual.firebaseUid);
    await coleccion.deleteOne({ _id: new ObjectId(id) });

    res.status(200).send({ mensaje: "Usuario eliminado correctamente de MongoDB y Firebase" });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

//hacer login
app.post('/login', async (req, res) => {
  try {
    const { Email, Contrasena } = req.body;
    const response = await signInWithEmailAndPassword(auth, Email, Contrasena);

    const firebaseUid = response.user.uid;

    const db = client.db("ProyectoUX");
    const coleccion = db.collection("Usuarios");

    const usuario = await coleccion.findOne({ firebaseUid });

    if (!usuario) {
      return res.status(404).send({ error: "Usuario no encontrado en MongoDB" });
    }

    res.status(200).send({
      mensaje: "Inicio de sesión exitoso",
      usuario: response.user.email,
      mongoId: usuario._id,
      firebaseUid: usuario.firebaseUid
    });
  } catch (error) {
    res.status(401).send({ error: error.message });
  }
});

//hacer logout
app.post('/logout', async (req, res) => {
    try {
        await signOut(auth);
        res.status(200).send({ mensaje: "Sesión cerrada correctamente" });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

//obtener peliculas por categoria (now_playing, top_rated, upcoming)
app.get('/Peliculas/Categoria/:tipo', async (req, res) => {
  const tipo = req.params.tipo; 
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${tipo}`, {
      params: { api_key: TMDB_API_KEY, language: 'es-ES' }
    });
    res.send(response.data.results);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

//buscar por nombre
app.get('/Peliculas/Buscar/:query', async (req, res) => {
  const query = req.params.query;
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: { api_key: TMDB_API_KEY, query, language: 'es-ES' }
    });
    res.send(response.data.results);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

//obtener los detalles de las peliculas
app.get('/Peliculas/:id/detalle', async (req, res) => {
  const id = req.params.id;
  try {
    const [info, videos, imagenes] = await Promise.all([
      axios.get(`${TMDB_BASE_URL}/movie/${id}`, {
        params: { api_key: TMDB_API_KEY, language: 'es-ES' }
      }),
      axios.get(`${TMDB_BASE_URL}/movie/${id}/videos`, {
        params: { api_key: TMDB_API_KEY, language: 'es-ES' }
      }),
      axios.get(`${TMDB_BASE_URL}/movie/${id}/images`, {
        params: { api_key: TMDB_API_KEY }
      })
    ]);

    res.send({
      id: info.data.id,
      titulo: info.data.title,
      descripcion: info.data.overview,
      puntuacion: info.data.vote_average,
      fecha_estreno: info.data.release_date,
      duracion: info.data.runtime,
      generos: info.data.genres,
      poster: `https://image.tmdb.org/t/p/w500${info.data.poster_path}`,
      fondo: `https://image.tmdb.org/t/p/w780${info.data.backdrop_path}`,
      videos: videos.data.results.filter(v => v.type === "Trailer" && v.site === "YouTube"),
      imagenes: imagenes.data.backdrops.map(img => `https://image.tmdb.org/t/p/w500${img.file_path}`)
    });

  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});


//solo titulo, poster, id y 
app.get('/Peliculas/:id/resumen', async (req, res) => {
  const id = req.params.id;
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${id}`, {
      params: { api_key: TMDB_API_KEY, language: 'es-ES' }
    });

    const data = response.data;

    res.send({
      id: data.id,
      titulo: data.title,
      puntuacion: data.vote_average,
      poster: `https://image.tmdb.org/t/p/w500${data.poster_path}`
    });

  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

//sinopsis, duracion, rating, trailer
app.get('/Peliculas/:id/ventanaInfo', async (req, res) => {
  const id = req.params.id;
  try {
    const [info, videos] = await Promise.all([
      axios.get(`${TMDB_BASE_URL}/movie/${id}`, {
        params: { api_key: TMDB_API_KEY, language: 'es-ES' }
      }),
      axios.get(`${TMDB_BASE_URL}/movie/${id}/videos`, {
        params: { api_key: TMDB_API_KEY, language: 'es-ES' }
      })
    ]);

    const trailer = videos.data.results.find(v => v.type === "Trailer" && v.site === "YouTube");

    res.send({
      titulo: info.data.title,
      sinopsis: info.data.overview,
      trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
      duracion: info.data.runtime,
      rating: info.data.vote_average
    });

  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});


//agregar a favoritos
app.post('/AddFavoritos/:uid/agregar', async (req, res) => {
  const { uid } = req.params;
  const pelicula = req.body;
  try {
    const db = await connectDB();
    await db.collection('Favoritos').updateOne(
      { uid },
      { $addToSet: { peliculas: pelicula } },
      { upsert: true }
    );
    res.send({ mensaje: 'Película agregada a favoritos' });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

//obtener los favoritos de un usuario
app.get('/GetFavoritos/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    const db = await connectDB();
    const doc = await db.collection('Favoritos').findOne({ uid });
    res.send(doc?.peliculas || []);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

//eliminar una pelicula del favoritos
app.delete('/DeleteFavoritos/:uid/:peliculaId', async (req, res) => {
  const { uid, peliculaId } = req.params;
  try {
    const db = await connectDB();
    await db.collection('Favoritos').updateOne(
      { uid },
      { $pull: { peliculas: { id: parseInt(peliculaId) } } }
    );
    res.send({ mensaje: 'Película eliminada de favoritos' });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('API ProyectoUX funcionando');
});

startServer();
module.exports = app;