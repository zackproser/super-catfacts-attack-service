var 
	//Parse JSON file into global config object
	config = require('./config.json'),
	requesting_admin = process.argv[2], 
	target = process.argv[3], 
	twilioClient = require('twilio')(config.twilio_sid, config.twilio_auth_token), 
	config = require('./config.json'), 
	catfacts = require('./data/catfacts.json')
; 

/**
 * Validate target phone number 
 *
 * If phone number is invalid, signal parent process to kill this child
 */
if (!isAValidPhoneTarget(target)){
	process.send({ status: 'invalid_target', child_target: target, requesting_admin: requesting_admin }); 
}

/**
 * Notify parent that attack is starting
 */
process.send({ status: 'starting_attack', child_target: target, requesting_admin: requesting_admin });

/**
 * Launch CatFacts Attack on the interval configured in config.json
 */
setInterval(function(){
   console.log('CatFacts Attack Mock Sending to: ' + target + ' FACT: ' + getCatFact() + ' FROM ' + config.catfacts_number); 
   twilioClient.sendSms({
     to: target, 
     from: config.catfacts_number, 
     //Pull a fact off the array
     body: getCatFact()
   }, function(err, responseData){
   	 if (err) console.error(err); 
   }); 
}, config.attackInterval); 

/**
 * Determine whether or not a supplied phone number is valid
 * @param  {String}  target The phone number to check for validity
 * @return {Boolean} isAValidPhoneTarget Whether or not the phone number is a valid target
 */
function isAValidPhoneTarget(target) {
	return (/^\d+$/.test(target)); 
}

/**
 * If there are CatFacts remaining, pop one off array and return it to launching function
 *
 * Otherwise, signal parent process that this CatFacts Attack is exhausted and should be killed
 */
function getCatFact() {
	if (!catfacts.length) process.send({ status: 'exhausted', child_target: target, requesting_admin: requesting_admin }); 
	return catfacts.pop(); 
}