const express = require('express');
const res = require('express/lib/response');
const router = express.Router();
const moment = require('moment');

const Vaccine = require('../models/Vaccine');
const { isAuthenticated } = require('../helpers/auth');
const User = require('../models/User');
const Turno = require('../models/Turnos');

const { ADMINISTRADOR } = require('../helpers/Roles');
const Turnos = require('../models/Turnos');
const nodemailer = require('nodemailer');
const SMTPConnection = require('nodemailer/lib/smtp-connection');

//solictar turno
router.get('/turns/solicitar', isAuthenticated, (req, res) => {
    res.render('turns/solicitar')
});

router.post('/turns/solicitar', isAuthenticated, async (req, res) => {
    const { vaccineName, sede } = req.body;
    const errors = [];
    const usuario = await User.findById(req.user.id);
    if (usuario.validado) {
        if (!vaccineName) {
            errors.push({ text: 'Por favor seleccione una vacuna' });
        } else {
            const vaccName = await Turno.findOne({ vaccineName: vaccineName, user: req.user.id });
            const vaccAplied = await Vaccine.findOne({ name: vaccineName, user: req.user.id })
            if (vaccName) {
                req.flash('error', 'Usted ya tiene un turno para esta vacuna');
                res.redirect('/turns/misturnos');
            } else {
                if (vaccAplied) {
                    req.flash('error', 'Ya tiene aplicada esta vacuna, no puede solicitar un turno');
                    res.redirect('/turns/misturnos');
                } else {
                    const newTurno = new Turno();
                    newTurno.vaccineName = vaccineName;
                    newTurno.user = req.user.id;
                    newTurno.appointed = false;
                    newTurno.attended = false;
                    newTurno.applied = false;
                    newTurno.orderDate = null; //new Date("2022-10-26"); 
                    newTurno.sede = sede;
                    await newTurno.save();
                    req.flash('success_msg', 'turno agregado correctamente');
                    res.redirect('/turns/misturnos');
                }
            }
        }
    } else {
        req.flash('error', 'Debe validar su identidad para poder solicitar turnos');
        res.redirect('/users/miperfil');
    }
});

router.get('/turns/turnosPasados', isAuthenticated, async (req, res) => {
    const turnos = await Turno.find({ user: req.user.id, attended: true }).lean().sort('desc');
    res.render('turns/misturnospasados', { turnos });
});

router.get('/turns/turnosVigentes', isAuthenticated, async (req, res) => {
    const turnos = await Turno.find({ user: req.user.id, attended: false }).lean().sort('desc');
    res.render('turns/misturnosvigentes', { turnos });
});

router.get('/turns/misturnos', isAuthenticated, async (req, res) => {
    const turnos = await Turno.find({ user: req.user.id }).lean().sort({ date: 'desc' });
    res.render('turns/misturnos', { turnos });
});

router.delete('/turns/delete/:id', isAuthenticated, async (req, res) => {
    await Turno.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Turno eliminado correctamente');
    res.redirect('/turns/misturnos');
});

//cancelar turno
router.delete('/turns/cancel/:id', isAuthenticated, async (req, res) => {
    const { orderDate } = await Turno.findById(req.params.id);
    if ((orderDate > Date.now()) || (orderDate === null)) {
        await Turno.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Turno cancelado correctamente');
        res.redirect('/turns/misturnos');
    } else {
        req.flash('error', 'Los turnos deben cancelarse con 24hs de anticipación.');
        res.redirect('/turns/misturnos');
    }
});

router.get('/turnos/solicitudes-turnos', isAuthenticated, async (req, res) => {
    const turnos = await Turno.aggregate([
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'usuario'
            }
        },
        { $unwind: "$usuario" }
    ])

    turnos.filter(turno => turno.orderDate === null);

    res.render('turns/solicitudes-turnos', { turnos });
})

router.get('/turns/asignar-turno/horarios', async (req, res) => {
    // horarios de 8am a 17pm en intervalos de 1 hora
    const HORARIOS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

    const date = req.query.date;

    function isWeekend(date = new Date()) {
        return date.getDay() === 6 || date.getDay() === 0;
    }

    if (isWeekend(new Date(date))) {
        return res.json([]);
    }
    console.log({body: req.query});
    
    const turnos = await Turno.find({
        orderDate: { 
            $gte: moment(new Date(date)).subtract(1, 'days').toDate(),
            $lt: moment(new Date(date)).add(1, 'days').toDate()
        },
    })
    horariosDisponibles= [...HORARIOS];
    turnos.map(turno => {
        console.log({horaTurno: turno.orderDate.getHours() + ":00"})
        const indexHorarioOcupado = horariosDisponibles.indexOf(turno.orderDate.getHours() + ":00");
        if (indexHorarioOcupado > -1) {
            horariosDisponibles.splice(indexHorarioOcupado, 1);
        }
    });

    console.log({turnosDelDia: turnos, $gte: moment(new Date(date)).subtract(1, 'days').toDate(),
    $lt: moment(new Date(date)).add(1, 'days').toDate()});


    res.json(horariosDisponibles);
})

router.get('/turns/asignar-turno/:id', async (req, res) => {
    const turno = await Turno.findById(req.params.id);
    const paciente = await User.findById(turno.user);
    res.render('turns/seleccionar-fecha-turno', { paciente, turno });
})

router.post('/turns/asignar-turno/:id', async (req, res) => {
    const turno = await Turno.findById(req.params.id);
    const arr = req.body.hour.split(':');
    const date = moment(new Date(req.body.date.split('-')).setHours(arr[0], arr[1], 0, 0));

    turno.orderDate = date;
    turno.appointed = true;
    await turno.save();
    req.flash('success_msg', 'Turno asignado correctamente');
    res.render('turns/solicitudes-turnos');
})

router.post('/turns/solicitudes-turnos/asignarSinRiesgo/:id', async (req, res) => {
    const { id } = req.params;
    const turno = await Turno.findById(id);
    const paciente = await User.findById(turno.user);
    /*
    if (paciente.edad > 60 || paciente.riesgo === "Si") {
        req.flash('error', 'El paciente es paciente de riesgo');
        res.redirect('/turnos/solicitudes-turnos');
        return
    }
    */
   let fecha= moment(new Date(Date.now()).setHours(08,00,0,0));
   if (turno.vaccineName=="Gripe"){
    fecha = fecha.add(6,'months');
   }
   if (turno.vaccineName=="Covid: dosis 1" || turno.vaccineName=="Covid: dosis 2"){
    if (paciente.edad<18){
        req.flash('error', 'El paciente debe ser mayor de 18 años para aplicarse la vacuna del covid');
        res.redirect('/turnos/solicitudes-turnos');
        return;
    }
    fecha = fecha.add(6,'months');
   }
   var turnop = await Turno.findOne({ orderDate : fecha })
   while (turnop){
    fecha = fecha.add(15,'m');
    var turnop = await Turno.findOne({ orderDate : fecha })
   }
   const tur = await Turno.findByIdAndUpdate(req.params.id, { "orderDate": fecha , "appointed": true });
   req.flash('success_msg', 'Turno asignado a paciente NO de riesgo');
    res.redirect('/turnos/solicitudes-turnos');
})

//Asignar turno - administrador
router.post('/turns/solicitudes-turnos/:id', async (req, res) => {
    const { id } = req.params;
    const turno = await Turno.findById(id);
    const paciente = await User.findById(turno.user);
    
   let fecha= moment(new Date(Date.now()).setHours(08,00,0,0));
   if (turno.vaccineName=="Gripe"){
    fecha = fecha.add(3,'months');
   }
   if (turno.vaccineName=="Covid: dosis 1" || turno.vaccineName=="Covid: dosis 2"){
    if (paciente.edad<18){
        req.flash('error', 'El paciente debe ser mayor de 18 años para aplicarse la vacuna del covid');
        res.redirect('/turnos/solicitudes-turnos');
        return;
    }
    fecha = fecha.add(1,'d');
   };
   
    var turnop = await Turno.findOne({ orderDate : fecha })
        while (turnop){
            fecha = fecha.add(15,'m');
            var turnop = await Turno.findOne({ orderDate : fecha })
            //console.log(fecha)
            console.log(turnop);
         }
    const tur = await Turno.findByIdAndUpdate(req.params.id, { "orderDate": fecha , "appointed": true});
    if (paciente.riesgo){
        req.flash('success_msg', 'Turno asignado a paciente de riesgo');
    }else{
        req.flash('success_msg', 'Turno asignado a persona mayor de 60 años');
    }
    res.redirect('/turnos/solicitudes-turnos');
})

//turnos hoy - vacunador
router.post('/turns/turnos-hoy', isAuthenticated, async (req, res) => {
    const { sede } = req.body;
    let resultado = await Turno.aggregate([
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'turnoUsuario'
            }
        },
        { $unwind: "$turnoUsuario" }
    ]);
    const fecha = new Date(Date.now()).setHours(0, 0, 0, 0);
    resultado = resultado.filter(r => r.orderDate !== null).filter(r => r.orderDate.setHours(0, 0, 0, 0) === fecha).filter(r => r.sede === sede);
    res.render('turns/turnoshoy', { resultado });
});

router.get('/turns/turnos-hoy', isAuthenticated, async (req, res) => {
    res.redirect('/turns/turnoshoy');
})

//marcar turno
router.post('/turns/marcarturno/:id', isAuthenticated, async (req, res) => {
    const tur = await Turno.findByIdAndUpdate(req.params.id, { "attended": true });
    res.redirect('/users/vacunador/selector-sede');
}
);

//Notificar turno
router.post('/turns/send-email/:id', async (req, res) => {
    const { id } = req.params;
    console.log("boton: ", req.body.boton);
    const turno = await Turno.findById(id);
    const paciente = await User.findById(turno.user);
    
    console.log('Turno: ', turno);
    console.log('Paciente: ', paciente);
    const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
            user: 'marlee.von7@ethereal.email',
            pass: 'ShCRGU5HVbknQaD3Ye'
        }
    });

    const mailOptions = {
        from: "Vacunassist",
        to: paciente.email,
        subject: "Notificación importante",
        text: " "
    }
    
    if (req.body.boton === "notificar") {
        const tur = await Turno.findByIdAndUpdate(req.params.id, { "notified": true });
        mailOptions.text = "Hola " + paciente.name + " " + paciente.surname + ", queríamos informarle que tiene un turno para aplicarse la vacuna " + turno.vaccineName + " para la Fecha :" + turno.orderDate + " en la  " + turno.sede 
    }
    if (req.body.boton === "cancelar") {
        mailOptions.text = "Hola " + paciente.name + " " + paciente.surname + ", queríamos informarle que su turno para la vacuna " + turno.vaccineName + " para la Fecha :" + turno.orderDate.Date + " en la  " + turno.sede + "ha sido cancelado"
      
    }
    if (req.body.boton === "reprogramar") {
        mailOptions.text = "Hola " + paciente.name + " " + paciente.surname + ", queríamos informarle que su turno para aplicarse la vacuna " + turno.vaccineName + " ha sido reprogramado para la Fecha :" + turno.orderDate + " en la  " + turno.sede
    }

    transporter.sendMail(mailOptions, async (error, info) => {
        if (error) {
            res.status(500).send(error.message);
        } else {
            res.status(200).jsonp(req.body);
        }
    });
    res.redirect("/turnos/solicitudes-turnos");
});


//todos los turnos pasados
router.get('/turns/turnospasados2', isAuthenticated, async (req, res) => {
    let resultado = await Turno.aggregate([
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'turnoUsuario'
            }
        },
        { $unwind: "$turnoUsuario" }
    ]);
    resultado = resultado.filter(r => r.attended == true);
    res.render('turns/turnospasadosadmin', { resultado });
});

//todos los turnos futuros
router.get('/turns/turnosfuturos', isAuthenticated, async (req, res) => {
    let resultado = await Turno.aggregate([
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'turnoUsuario'
            }
        },
        { $unwind: "$turnoUsuario" }
    ]);
    resultado = resultado.filter(r => r.orderDate > Date.now());
    res.render('turns/turnosfuturosadmin', { resultado });
});

//cancelar turno administrador
router.delete('/turns/cancel2/:id', isAuthenticated, async (req, res) => {
    const { orderDate } = await Turno.findById(req.params.id);
    console.log(orderDate);
    if ((orderDate > Date.now()) || (orderDate === null)) {
        await Turno.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Turno cancelado correctamente');
        res.redirect('/turns/turnosfuturos');
    } else {
        req.flash('error', 'Los turnos deben cancelarse con 24hs de anticipación.');
        res.redirect('/turns/turnosfuturos');
    }
});

//cancelar solicitud turno administrador
router.delete('/turns/rechazarSolicitud/:id', isAuthenticated, async (req, res) => {
    await Turno.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Turno rechazado correctamente');
    res.redirect('/turnos/solicitudes-turnos');
});


module.exports = router;