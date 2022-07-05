//este archivo es para arrancar nuestro servidor

const express = require('express');
const fileUpload = require("express-fileupload");
const path = require('path');
const exphbs = require('express-handlebars');
const methodOverride = require('method-override');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const { PACIENTE, ADMINISTRADOR, VACUNADOR } = require('./helpers/Roles');
const nodemailer = require('nodemailer');
const SMTPConnection = require('nodemailer/lib/smtp-connection');
const bp = require('body-parser'); 

// Inicializaciones
const app = express();
require('./database');
require('./config/passport');

// Setting - acá van todas nuestras configuraciones
app.set('port', process.env.port || 5000);
app.set('views', path.join(__dirname, 'views'));
app.engine('.hbs', exphbs.engine({
  defaultLayout: 'main',
  layoutsDir: path.join(app.get('views'), 'layouts'),
  partialsDir: path.join(app.get('views'), 'partials'),
  runtimeOptions: {
    allowProtoPropertiesByDefault: true,
    // allowProtoMethodsByDefault: true
  },
  extname: '.hbs',
}));
app.set('view engine', '.hbs');

var hbs = require('handlebars');
hbs.registerHelper("esMayor", function(value, value2)
{
  return value > 60 || value2==true;
});

// Middlewares - acá van todas nuestras funciones q van a ser ejecutadas antes de que lleguen al servidor
app.use(bp.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
  secret: 'mysecretapp',
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(
  fileUpload({
    createParentPath: true,
  })
);


// Global variables - nos sirve para colocar ciertos datos que queremos que toda nuestra aplicacion tenga accesible
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  if (req.user) {
    res.locals.isPaciente = req.user.role === PACIENTE;
    res.locals.isVacunador = req.user.role === VACUNADOR;
    res.locals.isAdministrador = req.user.role === ADMINISTRADOR;
  }
  next();
})

// Routes
app.use(require('./routes/index'))
//  app.use(require('./routes/notes'))
app.use(require('./routes/users'))
app.use(require('./routes/vaccines'))
app.use(require('./routes/turnos'))

//Manejo de archivos para la validación de identidad. 
app.get("/valid-id", (req, res) => {
  res.sendFile(path.join(__dirname, "valid-id"));
});

// Static files - para configurar donde estara la carpeta de archivos estaticos

app.use(express.static(path.join(__dirname, 'public')));

// Server is listenning
app.listen(app.get('port'), () => {
  console.log('Server on port', app.get('port'));
});




// //enviar mail, pegandole a localhost:5000/send-email desde postman con un post. 
// app.post('/send-email', (req, res) => {
//   const transporter = nodemailer.createTransport({
//     host: 'smtp.ethereal.email',
//     port: 587,
//     auth: {
//       user: 'marlee.von7@ethereal.email',
//       pass: 'ShCRGU5HVbknQaD3Ye'
//     }
//   });


//   const mailOptions = {
//     from: "Vacunassist",
//     to: "pablogagliardi91@gmail.com",
//     subject: "Enviado desde nodemailer",
//     text: "Hola Mundo",
//   };


//   transporter.sendMail(mailOptions, (error, info) => {
//     if (error) {
//       res.status(500).send(error.message);
//     } else {
//       console.log("Email enviado.");
//       res.status(200).jsonp(req.body);
//     }
// //   });
// });