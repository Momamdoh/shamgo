// custom module
// const logger = require("./logger")
// logger.print();
// logger.log();


const books = [
    {
        id: 1,
        name: "book1"
    },

    {
        id: 2,
        name: "book2"
    },


]

const http = require("http")

const server = http.createServer((req ,res)=>{

    if(req.url === "/"){

        res.write("<h1>hh</h1>");
        res.end();
    }

    if (req.url === "/book"){

        res.write(JSON.stringify(books));
        res.end();
    }
});

const PORT = 5000;
server.listen(5000 , () => console.log(`Running On http://localhost:${PORT}`));
