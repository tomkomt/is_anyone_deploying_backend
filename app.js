/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    user = require('./routes/user'),
    http = require('http'),
    path = require('path'),
    fs = require('fs'),
    immutable = require('immutable'),
    moment = require('moment');

var app = express();

var db;

var cloudant;

var fileToUpload;

var dbCredentials = {
    dbName: 'tonis_deployments'
};

var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var multipart = require('connect-multiparty')
var multipartMiddleware = multipart();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use(logger('dev'));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/style', express.static(path.join(__dirname, '/views/style')));

// development only
if ('development' == app.get('env')) {
    app.use(errorHandler());
}

function getDBCredentialsUrl(jsonData) {
    var vcapServices = JSON.parse(jsonData);
    // Pattern match to find the first instance of a Cloudant service in
    // VCAP_SERVICES. If you know your service key, you can access the
    // service credentials directly by using the vcapServices object.
    for (var vcapService in vcapServices) {
        if (vcapService.match(/cloudant/i)) {
            return vcapServices[vcapService][0].credentials.url;
        }
    }
}

function initDBConnection() {
    //When running on Bluemix, this variable will be set to a json object
    //containing all the service credentials of all the bound services
    if (process.env.VCAP_SERVICES) {
        dbCredentials.url = getDBCredentialsUrl(process.env.VCAP_SERVICES);
    } else { //When running locally, the VCAP_SERVICES will not be set

        // When running this app locally you can get your Cloudant credentials
        // from Bluemix (VCAP_SERVICES in "cf env" output or the Environment
        // Variables section for an app in the Bluemix console dashboard).
        // Once you have the credentials, paste them into a file called vcap-local.json.
        // Alternately you could point to a local database here instead of a
        // Bluemix service.
        // url will be in this format: https://username:password@xxxxxxxxx-bluemix.cloudant.com
        dbCredentials.url = getDBCredentialsUrl(fs.readFileSync("vcap-local.json", "utf-8"));
    }

    cloudant = require('cloudant')(dbCredentials.url);

    // check if DB exists if not create
    cloudant.db.create(dbCredentials.dbName, function(err, res) {
        if (err) {
            console.log('Could not create new db: ' + dbCredentials.dbName + ', it might already exist.');
        }
    });

    db = cloudant.use(dbCredentials.dbName);
}

initDBConnection();

app.get('/esp/opm', function(request, response) {
    console.log(request.headers);
    
    db = cloudant.use(dbCredentials.dbName);
    db.list({ include_docs: true },(err, body) => {
        if(!err) {
            var docsBody = immutable.fromJS(body);
            var currentDocs = docsBody.get('rows').filter((doc) => {
                return doc.getIn(['doc', 'server']) == 'opm'; 
            });
            currentDocs = currentDocs.filter((doc) => {
                return moment().diff(moment(+doc.getIn(['doc', 'date'])), 'minutes') < 2;
            });
            console.log(currentDocs);

            if(currentDocs.size == 0) {
                response.write('2');
                response.end();
            } else {
                if(currentDocs.first().getIn(['doc', 'serverStatus']) == '1') {
                    response.write('1');                    
                } else {
                    response.write('0');
                }
                response.end();
            }
        } else {
            console.error("List error", error);
        }
    })
});

app.get('/esp/opm/verbose', function(request, response) {
    db = cloudant.use(dbCredentials.dbName);
    db.list({ include_docs: true },(err, body) => {
        if(!err) {
            var docsBody = immutable.fromJS(body);
            var currentDocs = docsBody.get('rows').filter((doc) => {
                return doc.getIn(['doc', 'server']) == 'opm'; 
            });
            currentDocs = currentDocs.filter((doc) => {
                return moment().diff(moment(+doc.getIn(['doc', 'date'])), 'minutes') < 2;
            });
            console.log(currentDocs);

            response.write(JSON.stringify(currentDocs.toJS()));
            response.end();
        } else {
            console.error("List error", error);
        }
    })
});

app.get('/esp/opm/insertQuery', function(request, response) {
    db = cloudant.use(dbCredentials.dbName);
    var insertData = {
        server: 'opm',
        serverStatus: '',
        date: moment().format('x')
    };
    if(request.query.hasOwnProperty('server')) {
        insertData.server = request.query.server;
    }
    if(request.query.hasOwnProperty('serverStatus')) {
        insertData.serverStatus = request.query.serverStatus;
    }

    db.insert(insertData, function(err, body) {
        if(err) {
            response.write(JSON.stringify(err));
        } else {
            response.write('OK');
        }
        response.end();
    })
});

http.createServer(app).listen(app.get('port'), '0.0.0.0', function() {
    console.log('Express server listening on port ' + app.get('port'));
});
