const { get } = require('http');

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 80;
var rooms = {};
var words = [
    "simba", "aang", "jojo", "stitch", "panda", "rata", "wario", "francia",
    "dado", "vaso", "frijol", "camisa", "camiseta", "zapato", "zapatos",
    "celular", "silla", "mesa", "switch", "zelda", "woody", "buzz",
    "katara", "elvis", "rey", "teclado", "guitarra", "bajo", "electricidad",
    "veneno", "agua", "fuego", "rayquaza", "puerta", "ventana", "perro",
    "perros", "gato", "gatos", "hidrante"
]

function getWords(){
    var selected_words = []
    for (let index = 0; index < 3; index++) {
        selected_words.push(words[Math.floor(Math.random()*words.length)])
    }
    return selected_words;
}

function endRound(msg){
    rooms[msg.room].users.forEach(u => {
        u.guessed = false;
        u.points = u.added_points + u.points;
        u.added_points = 0;
        u.drawer = false;
    });
    var index = rooms[msg.room].game.drawer_index + 1;
    if(index >= rooms[msg.room].users.length){
        index = 0;
    }
    clearTimeout(rooms[msg.room].game.timeout);
    rooms[msg.room].game = {
        current_word: "",
        guessed: 0,
        words: getWords(),
        drawer_index: index,
        drawer: rooms[msg.room].users[index],
        timeout: "",
    }
    rooms[msg.room].game.drawer.drawer = true;
    io.to(msg.room).emit('start game', true);
    io.to(msg.room).emit('update score', rooms[msg.room].users)
    io.to(rooms[msg.room].game.drawer.id).emit('choose word', rooms[msg.room].game.words);
}


app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});
http.listen(port, function(){
    console.log('listening on *:' + port);
});

io.on('connection', socket => {
    socket.on('enter room', msg =>{
        socket.join(msg.room);
        socket.to(msg.room).emit('new user', msg.name);
        if (msg.room in rooms){
            socket.emit('first connected', rooms[msg.room].users);
            rooms[msg.room].users.push({
                id:socket.id,
                name:msg.name,
                owner: false,
                guessed: false,
                added_points:0,
                drawer: false,
                points: 0
            });
            return;
        }
        rooms[msg.room] = {
            users: [{
                id:socket.id,
                name:msg.name,
                owner: true,
                guessed: false,
                added_points:0,
                drawer: false,
                points: 0
                }
            ]
        }
    });
    socket.on('update canvas', msg =>{
        if("game" in rooms[msg[4]] && rooms[msg[4]].game.drawer.id == socket.id){
            socket.to(msg[4]).emit('update canvas', msg);
        }
        else{
            socket.to(msg[4]).emit('update canvas', msg);
        }
    });

    socket.on('start game', msg=>{
        if(rooms[msg].users.some(v => v.id == socket.id && v.owner == true)){
            var index = Math.floor(Math.random()*rooms[msg].users.length)
            rooms[msg].game = {
                current_word: "",
                guessed: 0,
                words: getWords(),
                drawer_index: index,
                drawer: rooms[msg].users[index],
                timeout: "",
            }
            rooms[msg].game.drawer.drawer = true;
            socket.to(msg).emit('start game', true);
            io.to(msg).emit('update score', rooms[msg].users)
            io.to(rooms[msg].game.drawer.id).emit('choose word', rooms[msg].game.words);
        }
    })

    socket.on('choose word', msg=>{
        if("game" in rooms[msg.room] && rooms[msg.room].users.some(v => v.id == socket.id && rooms[msg.room].game.drawer.id == socket.id)){
            rooms[msg.room].game.current_word = msg.word;
            socket.to(msg.room).emit('start round', msg.word.length);
            rooms[msg.room].game.timeout = setTimeout(function(){
                endRound(msg);
            }, 80000)
        }
    })
    
    socket.on('chat message', msg => {
        var user = rooms[msg.room].users.find(v => v.id == socket.id);
        if("game" in rooms[msg.room] && rooms[msg.room].game.current_word != ""){
            if(rooms[msg.room].game.drawer.id == socket.id){
                socket.emit('chat message', {name:false, message:"Shhhh", server: true})
                return;
            }
            if(msg.message.toLowerCase() == rooms[msg.room].game.current_word){
                if(!user.guessed){
                    io.to(msg.room).emit('chat message',{name:false, message:`${user.name} ha adivinado`, server: true});
                    user.guessed = true;
                    user.added_points = Math.floor(500 - rooms[msg.room].game.guessed*300/rooms[msg.room].users.length);
                    rooms[msg.room].game.guessed++;
                    rooms[msg.room].game.drawer.added_points = Math.floor(rooms[msg.room].game.guessed*300/rooms[msg.room].users.length)
                    if(rooms[msg.room].game.guessed == (rooms[msg.room].users.length - 1)){
                        endRound(msg);
                    }
                }
                else{
                    socket.emit('chat message',{name:false, message:"Ya adivinaste", server: true})
                }
                return;
            }
        }
        io.to(msg.room).emit('chat message', {name:user.name,message: msg.message});
    });

    socket.on('clear', msg=>{  
        if(rooms[msg.room].users.some(v => v.id == socket.id && v.owner == true)){
            socket.to(msg.room).emit('clear', true);
        }
        else{
            socket.to(msg.room).emit('clear', true);
        }
    })

    socket.on('disconnect', msg=>{
        if(socket.handshake.query.room in rooms){
            rooms[socket.handshake.query.room].users = rooms[socket.handshake.query.room].users.filter(v => v.id != socket.id);
            socket.to(socket.handshake.query.room).emit('disconnected', rooms[socket.handshake.query.room].users);
        }
    })
});