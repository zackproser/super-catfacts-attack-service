var 
	//Parse JSON file into global config object
	config = require('./config.json'),
	express = require('express'),
	app = express(),
	twilio = require('twilio'),  
	twilioClient = require('twilio')(config.twilio_sid, config.twilio_auth_token), 
	bodyParser = require('body-parser'), 
	child_process = require('child_process')
;

/**
 * Extend the array primitive to allow returning of a random element
 * 
 * @return {Mixed} - A randomly selected element from the array
 */
Array.prototype.random = function(){
	return this[Math.floor(Math.random() * this.length)]; 
} 

/**
 * Parses passed environment variable to determine which port to listen on
 * 
 * @param  {Function} callback 
 * @return void
 */
function determineEnvironment(callback) {
	var env = process.env.ENVIRONMENT; 
	if (env == 'dev' || env == 'development') {
		app.set('port', 3000);
		callback(null);  
	} else if (env == 'prod' || env == 'production') {
		app.set('port', 8080); 
		callback(null); 
	} else {
		callback(new Error('You must specify either dev or prod environments via process.env.ENVIRONMENT when starting the service.')); 
	}
}

/**
 * Configure middleware and start listening for requests
 * 
 * @return void
 */
function start(){
	//Use bodyParser so we can get the params that Twilio will POST
	app.use(bodyParser());

	//Set static path so we can serve <server>/sounds/<filename> within our Twiml
	app.use(express.static('public')); 

	//Initialize app-level activeTargets array
	app.set('activeAttacks', []); 

	//Listen on the correct port for the given environment
	app.listen(app.get('port'), function(){
		console.log('Super Catfacts Attack Service running on ' + app.get('port')); 
	}); 
}

//Determine environment and start the server
determineEnvironment(function(err){
	if (err) throw err; 
	start(); 
}); 

/**
 * Determines whether or not the given requestor - who sent a command text to the server - is authorized or not
 *
 * Inspects the config object stored in config.json
 * 
 * @param  {String}  requestor The phone number of the person who sent the sms command
 * @return {Boolean} isAuthorizedUser Whether or not the given user is authorized to make commands
 */
function isAuthorizedUser(requestor) {
	//Is the current requestor specified as an admin in config.json?
	return (config.authorized_users.indexOf(requestor) > -1); 
}

/**
 * Checks whether or not the given sms command is a stop attack command
 * 
 * @param  {String}  payload 
 * @return {String | Boolean} Returns false if not a stop command. Otherwise returns the number to stop attacking
 * @
 */
function isStopRequest(payload) {
	payload = payload.toLowerCase(); 
	var hasStopCommand = /downboy/.test(payload); 
	if (hasStopCommand){
		payload = payload.replace('downboy', '').trim(); 
	}
	var hasTarget = /^\d+$/.test(payload); 
	if (hasTarget && hasStopCommand) {
	    return payload; 
	} else {
	    return false;
	}
}

/////////////////////////
// ROUTES
/////////////////////////

/**
 * Handle incoming sms commands
 *
 * Verifies that the requestor is authorized - then determines the request type (start / stop attacking)
 *
 * Finally starts or stops an attack as appropriate
 * 
 * @param  {Request} Twilio POST request - generated when a user sends an sms to the associated Twilio number
 * @param  {Response} Express response
 *  
 */
app.post('/incoming-sms', function(req, res){
	//Get the requestor's phone number from the Twilio POST object	
	var requestor = req.body.From; 

	//If target is currently under attack and is not an admin - and they text this number - give them a particular text response
	if (isTargetBeingAttacked(requestor) && !isAuthorizedUser(requestor)){

		sendResponseSMS(requestor, 'Command not recognized. We will upgrade your CatFacts account to send you facts more frequently. Thanks for choosing CatFacts!');

	} else if (!isAuthorizedUser(requestor)){
		//Do nothing and do not respond if requestor is unauthorized
		return;
		
	} else {

		//Get body content of sms sent by requestor
		var payload = req.body.Body; 

		//Check if this is a stop attack request - returns target number if it is
		var check = isStopRequest(payload); 

		if(check){
			//isStopRequest returns the target phone number for valid stop requests
			var target = check; 
			//Stop the attack on the supplied number
			handleAdminStopRequest(requestor, target); 

		} else {
			//Start an attack on the supplied number
			handleAdminAttackRequest(requestor, payload); 
		}	

		//Give Twilio a successful response for logging purposes
		res.status(200).send('Finished processing POST request to /incoming-sms');
	}
}); 

/**
 * Handle a user phoning the Super CatFacts Attack Call Center
 * 
 * @param  {Request} - POST request from Twilio - generated when a user calls the associated Twilio phone number           
 * @param  {Response}
 * @return {Response} - Response containing valid Twiml as a string - which creates the CatFacts call center experience                      
 */
app.post('/incoming-call', function(req, res){
	res.writeHead(200, { 'Content-Type': 'text/xml' }); 
	res.end(generateCallResponseTwiml().toString()); 
}); 

/**
 * Handle user inputs during the CatFacts Call Center Menu
 * 
 * @param  {Request} req       Express Request
 * @param  {Response} res	   Express Response  
 * 
 * @return {[type]}            Response containing valid Twiml for Twilio to parse
 */
app.post('/catfacts-call-menu', function(req, res){
	//Get the number the user pressed from the Twilio request object
	var pressed = req.body.Digits; 
	var calling_user = req.body.From; 

	//Set up headers
	res.writeHead(200, { 'Content-Type': 'text/xml' });

	//Handle whichever number the user pressed
	switch(pressed){
		case '1': 
			//User requested a CatFact - pull a random one out of catfacts.json
			var fact = require('./data/catfacts.json').random(); 
			//Send a random CatFact to the caller
			sendResponseSMS(calling_user, fact); 
			//Create a twiml response to build up
			var twiml = new twilio.TwimlResponse(); 
			twiml.say('One brand spanking new Cat Fact coming right up. We\'re working hard to deliver your fact. Thanks for using CatFacts and please call again!', {
				voice: 'man', 
				language: 'en'
			})
			//Play a sound that Express is serving as a static file
			.play(config.server_root + '/sounds/angryMeow.wav');
			//Send the response back for Twilio to parse on the fly - and play for the caller
			res.end(twiml.toString()); 
			break; 
		case '2':
			//User wants to know why they were subscribed to CatFacts - Why, because they love cats, of course!
			var twiml = new twilio.TwimlResponse(); 
			twiml.say('Please wait one moment while I pull up your account', {
				voice: 'man', 
				language: 'en'
			})
			.play(config.server_root + '/sounds/longMeow.wav')
			.say('Thanks for your patience. You were subscribed to CatFacts because you love fun facts about cats. As a thank you for calling in today, we will increase the frequency of your catfacts account at no extra charge', {
				voice: 'man', 
				language: 'en'
			})
			.play(config.server_root + '/sounds/angryMeow.wav')
			.say('Have a furry and fantastic day', {
				voice: 'man', 
				language: 'en'
			}); 
			//Send account explanation response back to Twilio to parse on the fly - and play for the caller
			res.end(twiml.toString()); 
			break; 
		case '3': 
			//User wants to unsubscribe - but we don't like quitters
			var twiml = new twilio.TwimlResponse(); 
			twiml.say('We understand you would like to cancel your CatFacts account. Unfortunately, we are currently experiencing technical difficulties and cannot process your request at this time. To apologize for the inconvenience, we have upgraded you to a Super CatFacts Account for no extra charge', {
				voice: 'man', 
				language: 'en'
			})
			.play(config.server_root + '/sounds/angryMeow.wav'); 
			res.end(twiml.toString()); 
			break; 
		default: 
			var twiml = new twilio.TwimlResponse(); 
			twiml.say('Sorry, we were unable to process your request at this time. Don\'t worry, we will send you complimentary CatFacts as an apology for the inconvenience.', {
				voice: 'man', 
				language: 'en'
			})
			.play(config.server_root + '/sounds/angryMeow.wav'); 
			res.end(twiml.toString()); 
			break; 
	}

}); 

/**
 * Generates valid Twiml that creates the Super CatFacts Attack Call Center menu experience
 * 
 * @return {String} response - valid Twiml xml complete with say, play and gather commands
 */
function generateCallResponseTwiml() {
	var response = new twilio.TwimlResponse(); 
	response.say("Thank you for calling Cat Facts!", {
		voice: 'man', 
		language: 'en'
	})
	.play(config.server_root + '/sounds/shortMeow.wav')
	.say("Cat Facts is the number one provider of fun facts about cats! All of our representatives are currently assisting other cat lovers. Please remain on the feline! In the meantime, please listen carefully as our menu options have recently changed.", {
		voice: 'man', 
		language: 'en'
	})
	.gather({
		action: config.server_root + '/catfacts-call-menu', 
		finishOnKey: '*'
	}, function(){
		this.say("If you would like to receive a fun cat fact right now, press 1. If you would like to learn about how you were subscribed to CAT FACTS, please press 2", {
			voice: 'man', 
			language: 'en'
		})
		.say("If for some fur-brained reason you would like to unsubscribe from fantastic hourly cat facts, please press 3 3 3 3 4 6 7 8 9 3 1 2 6 in order right now", {
			voice: 'man', 
			language: 'en'
		})
	}); 

	return response; 
}
/**
 * Helper method to send an sms with the supplied body to the supplied phone number 
 * 
 * @param  {String} to - 
 * @param  {[type]} body [description]
 * @return {[type]}      [description]
 */
function sendResponseSMS(to, body) {
	console.log('sendResponseSMS ' + config.catfacts_number);
	twilioClient.sendSms({
	    to: to, 
	    from: config.catfacts_number, 
	    body: body
		}, function(err, responseData){
	   		if (err) console.error(err); 
	   	 	console.dir(responseData); 
   }); 
}

/**
 * Processes an authorized admin's attack request and launches the attack
 *
 * Handles tracking the attack child process at the app-level so it can be referenced later / stopped
 * 
 * @param  {String} requesting_admin - The phone number of the requesting admin
 * @param  {String} target - The phone number of the target to be attacked
 * 
 * @return void
 */
handleAdminAttackRequest = function(requesting_admin, target) {
	//Ensure target is not already being attacked (we have some degree of decency - no?)
	if (!isTargetBeingAttacked(target)) {
		//Fork a new attack process - passing the requesting admin's phone number and target phone number as string arguments
		var CatfactsAttack = child_process.fork('./attack.js', [requesting_admin, target]); 
		//Handle messages sent back from child processes
		CatfactsAttack.on('message', function(m){
			switch(m.status){
				case 'invalid_status':
					CatfactsAttack.kill(); 
					//Send invalid target sms back to admin
					sendResponseSMS(m.requesting_admin, 'Oops! ' + target + ' doesn\'t appear to be a valid number. Attack NOT Launched!');
					break; 
				case 'starting_attack': 
					//Tag the attack child_process with its target number
					CatfactsAttack.target_number = m.child_target;					
					//Add child_process to app-level array of current attacks
					beginTrackingAttack(CatfactsAttack); 
					//Send sms confirming attack back to admin
					sendResponseSMS(m.requesting_admin, 'Attack Vector Confirmed: CatFacts Bombardment Underway! - Text: "downboy ' + m.child_target + '" to stop attack.'); 
					break;
				case 'exhausted': 
					//Remove number from app-level array of numbers being attacked
					stopTrackingAttack(m.child_target);
					//Send exhaustion notification sms back to admin 
					sendResponseSMS(m.requesting_admin, 'CatFacts Attack on ' + target + ' ran out of facts! Attack Complete.');  
					CatfactsAttack.kill();
					break;
			}
		}); 
	}
}

/**
 * Adds given child_process to the app-level array of running attacks so it can be terminated later
 * 
 * @param  {Object} child_process - A node child process representing a currently running attack
 * 
 * @return void
 */
beginTrackingAttack = function(child_process) {
	var currentAttacks = app.get('activeAttacks');
	currentAttacks.push(child_process);  
	app.set('activeAttacks', currentAttacks); 
}

/**
 * Finds a currently running attack by phone number and terminates it in response to an admin stop attack request
 * 
 * @param  {String} requesting_admin - The phone number of the admin requesting a stop
 * @param  {String} target_number   - The phone number that should not be attacked anymore
 * @return void
 */
handleAdminStopRequest = function(requesting_admin, target_number) {
	var currentAttacks = app.get('activeAttacks');
	var foundAttack = false;
	if (!currentAttacks.length) return; 
	currentAttacks.forEach(function(currentAttack){
		if (currentAttack.target_number == target_number){
			foundAttack = currentAttack; 
		}
	}); 
	if (foundAttack){
		foundAttack.kill(); 
		sendResponseSMS(requesting_admin, 'Successfully terminated CatFacts Attack on ' + target_number);
	}
}

/**
 * Helper method that determines whether or not a supplied number is currently under attack
 * 
 * @param  {String}  target - the phone number to check for current attacks
 * @return {Boolean} targetIsBeingAttacked - Whether or not the given number is under attack
 */
isTargetBeingAttacked = function(target) {
	if (target.charAt(0) == '+' && target.charAt(1) == '1'){
		target = target.replace('+1', '');
	} 
	var targetIsBeingAttacked = false; 
	var currentAttacks = app.get('activeAttacks');
	if (!currentAttacks.length) return; 
	currentAttacks.forEach(function(currentAttack){
		if (currentAttack.target_number == target){
			targetIsBeingAttacked = true; 
		}
	}); 
	return targetIsBeingAttacked; 
}