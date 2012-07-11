#GamersHub-Real-Time-Server

A real time event-oriented server written in JavaScript using NodeJS, that handles all real-time events happening in the GamersHub social network.

##Installation

-Install NodeJS from the Node website http://nodejs.org/ for your SO.

-Install the mysql module with npm (node package manager), included with Node (It's not an alpha, don't know why the package is named like this):
>npm install mysql@2.0.0-alpha2

-Install the socket.io module also with npm:
>npm install socket.io

##Usage

-Configure the connection to the MySQL server editing Config.js

-Execute the Server.js script with node:
>node Server.js

**Note that the files must be placed in the NodeJS root folder.**