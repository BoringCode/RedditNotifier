//Reddit Notifier main.js!
//This is where the magic happens

//Get dependencies
var data = require('self').data;
var prefs = require("sdk/simple-prefs");
var request = require("sdk/request");
var notifications = require("sdk/notifications");
var timers = require("sdk/timers");
var tabs = require("sdk/tabs");
var windowutils = require("window-utils");
var toolbarbutton = require("./toolbarbutton");
var userstyles = require("./userstyles");
var worker = require("page-worker");

var config = {
	name: "RedditNotifier",
	urls: {
		unreadMessage: "http://www.reddit.com/message/unread/",
		unreadModerator: "http://www.reddit.com/message/moderator/unread/",
		login: "https://ssl.reddit.com/login",
		install: "http://bradleyrosenfeld.com/RedditNotifier"
	},
	unreadURLS: {
		unreadMessage: "http://www.reddit.com/message/unread.json",
		unreadModerator: "http://www.reddit.com/message/moderator/unread.json"
	},
	messages: {
		unreadMessage: "%num% new message(s)",
		unreadModerator: "%num% new moderator mail message(s)",
		loggedOut: "It looks like you are logged out of Reddit. Try logging in."
	},
	//multiplied by 1000 to get seconds, minus to 1000 to take into account delay when loading new data
	refreshTime: prefs.prefs.timing*1000 - 1000,
	forceShow: prefs.prefs.forceShow,
	delayLoad: 5000,
	icons: {
		big: data.url("reddit-notifier-icon.png"),
		small: data.url("reddit-notifier-icon-small.png"),
		smallUnread: data.url("reddit-notifier-icon-small-unread.png")
	},
	alert: "alert.wav",
	toolbar: {
		id: "redditnotifierbutton",
		tooltip: "RedditNotifier\nClick to open inbox, opposite click to refresh",
		backgroundColor: "#ff3f00",
		textColor: "#FFF",
	    move: {
	      toolbarID: "nav-bar",
	      insertBefore: "home-button",
	      forceMove: false
	    }
	}
}

var main = {
	addonButton: null,
	timer: null,
	numUnread: {},
	newUnread: {},
	//Error notification is shown when false, errors set to true to allow for linking to login URL at start
	error: false,
	errors: true,
	//Called by the browser at runtime
	init: function(options, callbacks) {
		//create button for refreshing/opening inbox
		main.addonButton = toolbarbutton.ToolbarButton({
			id: config.toolbar.id,
		  	label: config.name,
		  	tooltiptext: config.toolbar.tooltip,
		  	textColor: config.toolbar.textColor,
		  	backgroundColor: config.toolbar.backgroundColor,
		  	onClick: function (e) {
		  		if (e.button === 2) {
		  			e.preventDefault();
		  			e.stopPropagation();
		  			//refresh
		  			main.error = false;
		  			main.errors = false;
		  			main.update();
		  			return false;
		  		}
		  	},
		  	onCommand: main.showUnread
		});
		//first run or update
		if (options.loadReason === "install" || options.loadReason === "upgrade") {
			//timers.setTimeout(main.install, config.delayLoad);
		}
		//move the button if it is hidden
		if (options.loadReason === "install" || config.forceShow) {
			main.addonButton.moveTo(config.toolbar.move);
		}
		//Sets the image and such
		userstyles.load(data.url("bubble.css"));
		//run the for the first time, don't do it right when the browser loads though
		main.timer = timers.setTimeout(main.update, config.delayLoad);
	},
	update: function() {
		timers.clearTimeout(main.timer);
		//change the button icon to reflect the refresh
		main.addonButton.type = "refresh";
		//runs the request, calls the updateButton function
		for (key in config.unreadURLS) {
			function runRequest(key) {
				request.Request({
					url: config.unreadURLS[key],
					onComplete: function (returned) {
						var response = returned.json;
						//check if logged in
						if (response !== null && response.hasOwnProperty("data")) {
							//Store the array of messages
							//Let's make this smarter someday. I should store the timestamp of the newest message.
							var messages = response["data"]["children"];
							//Get the number
							main.newUnread[key] = 0;
							//Count the number of messages
							for (var message in messages) {
								if (messages.hasOwnProperty(message)) {
									main.newUnread[key]++;
								}
							}
							main.errors = false;
							main.error = false;
						} else {
							main.errors = true;
						}
						//check if last URL to check
						var keys = Object.keys(config.unreadURLS);
						if (key === keys[keys.length - 1]) {
							//Keys aren't always looped in order, so delay for one second to compensate
							//This will fix most failures to register new messages
							//Kind of hacky as it is, but meh.
							timers.setTimeout(main.showMessages, 1000);
						}
					}
				}).get();
			}
			runRequest(key);
		}
	},
	showMessages: function() {
		if (!main.errors) {
			var msg = "";
			var showMessage = false;
			for (var key in main.newUnread) {
				var numNew = 0;
				//If the number is greater, alert the user
				if (main.newUnread[key] > main.numUnread[key]) {
					numNew = main.newUnread[key] - main.numUnread[key];
				} else if (main.numUnread[key] === undefined) {
					numNew = main.newUnread[key];
				}
				//Create message
				if (numNew > 0) {
					msg += config.messages[key].replace("%num%", numNew) + "\n";
					showMessage = true;
				}
				//Change the unread count for the key
				main.numUnread[key] = main.newUnread[key];
			}
			//Only show message if there are new messages
			if (showMessage) {
				main.notify("New Messages", msg, true, main.showUnread);
			}
		//logged out
		} else {
			//Reset unread counts
			for (key in main.numUnread) {
				main.numUnread[key] = 0;
			}
			//Check to see if this message has been displayed already
			if (!main.error) {
				main.notify("Error", config.messages.loggedOut, false, function() {
					main.openTab(config.urls.login);
				});
				main.error = true;
			}
		}
		//Refresh the button
		main.updateButton();
		//Call update function again after set amount of time
		main.timer = timers.setTimeout(main.update, config.refreshTime);
	},
	updateButton: function() {
		var numUnread = 0;
		for (var key in main.numUnread) {
			numUnread += main.numUnread[key];
		}
		//change the badge
		if (numUnread >= 10) {
			main.addonButton.badge = "∞";
		} else {
			main.addonButton.badge = numUnread;
		}
		//change the icon
		if (numUnread > 0) {
			main.addonButton.type = "unread";
		} else {
			main.addonButton.type = "read";
		}
	},
	showUnread: function () {
  		var url = config.urls.unreadMessage;
  		var greatestNumMessages = 0;
		if (!main.errors) {
	  		for (var key in main.numUnread) {
	  			//decide which URL to open
	  			//Whichever URL has the greatest number of unread messages
	  			if (main.numUnread[key] > greatestNumMessages) {
	  				greatestNumMessages = main.numUnread[key];
	  				url = config.urls[key];
		  			//reset the count
		  			main.numUnread[key] = 0;
	  			}
	  		}
  		} else {
  			url = config.urls.login;
  		}
  		main.updateButton();
		main.openTab(url);
  	},
	install: function() {
		main.openTab(config.urls.install);
	},
	notify: function(title, text, alert, callback, passData) {
		//Only show notifications if the user wants them
		if (prefs.prefs.showNotifications) {
			//Only play sound if user wants them and alert is true
			//Errors are silent
			if (prefs.prefs.playAlert && alert) {
				//play a sound on a page worker
				worker.Page({
					contentScript: "var audio = new Audio('" + config.alert + "'); audio.play();",
					contentURL: data.url("alert/alert.html")
				});
			}
			notifications.notify({
				title: config.name + " - " + title,
			 	text: text,
			 	iconURL: config.icons.big,
			 	data: passData,
			 	onClick: function(passData) {
			 		if (typeof(callback) === 'function') {
			 			callback(passData);
			 		}
			 	}
			});
		}
	},
	openTab: function(url) {
		//check if already open
		for each (var tab in tabs) {
			console.log(tab.url);
			//If already open, reload and then switch to the tab
			if (tab.url === url) {
				tab.reload();
				tab.activate();
				return;
			}
		}
		tabs.open(url);
	},
	timingOption: function(name) {
		//Change the refresh time to the new value
		if (prefs.prefs[name] >= 30) {
			config.refreshTime = prefs.prefs[name]*1000;
		} else {
			config.refreshTime = 30000;
		}
	}
}

exports.main = main.init;
//This function verifies the user input
prefs.on("timing", main.timingOption);