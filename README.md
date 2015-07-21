# Super CatFacts Attack as a Service

SCFA is an elaborate pranking service written in node.js and leveraging Twilio that accepts sms commands from you and authorized friends, launches and runs multiple simultaneous CatFacts attacks on victims you specify, and creates a perfectly maddening but just plausible enough call center menu experience. 

An in-depth tutorial based on this project is forthcoming on zackproser.com.

All joking aside, SCFA demonstrates the following techniques, which can be used for good:

  - Controlling a deployed service via sms messages
  - Locking down your service to only respond to authorized users
  - Forking child processes in node in response to a command
  - Keeping tabs on child processes so they can be terminated later

## Getting Started
    $ git clone https://github.com/zackproser/supercatfactsattack.git 
    $ cd super-catfacts-attack-service
    $ vi config.json 
    
Fill in your config.json according to the placeholders. You'll need a working and funded Twilio account and at least one active Twilio phone number.

Once your config.json is filled in, you're ready to deploy the service: 

    $ ENVIRONMENT=prod node super-catfacts-attack-service.js

Finally, point your Twilio phone number at the correct ip address for your server and the production port, which defaults to 8080. 

![Configuring CatFacts Attack Server URLs](/public/img/twilio-dashboard-config.png)

Now, you can start an attack by texting your server the phone number of your victim. You will receive a confirmation text letting you know the attack is underway, and reminding you that you can text 'Downboy' + the number to stop the attack. 

The service is designed to fork separate child processes to manage each individual attack, meaning you can start up multiple simultaneous attacks on multiple friends and family members - each will receive their own private attack context.

You are welcome.