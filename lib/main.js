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

var config = {
	name: "RedditNotifier",
	urls: {
		unreadMessage: "http://www.reddit.com/message/unread/",
		unreadMessageJSON: "http://www.reddit.com/message/unread.json",
		login: "https://ssl.reddit.com/login"
	},
	//multiplied by 1000 to get seconds
	refreshTime: prefs.prefs.timing*1000,
	forceShow: prefs.prefs.forceShow,
	delayLoad: 5000,
	icons: {
		big: data.url("reddit-notifier-icon.png"),
		small: data.url("reddit-notifier-icon-small.png"),
		smallUnread: data.url("reddit-notifier-icon-small-unread.png")
	},
	errors: {
		loggedOut: "It looks like you are logged out of Reddit. Try logging in."
	},
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
	numUnread: 0,
	error: false,
	//Called by the browser at runtime
	init: function(options, callbacks) {
		//create button for refreshing/opening inbox
		main.addonButton = toolbarbutton.ToolbarButton({
			id: config.toolbar.id,
		  	label: config.name,
		  	tooltiptext: config.toolbar.tooltip,
		  	textColor: config.toolbar.textColor,
		  	backgroundColor: config.toolbar.backgroundColor,
		  	onContext: function () {
		  		//reset the error
		  		main.error = false;
		  		main.update();
		  	},
		  	onCommand: function () {
		  		//reset the count on click
		  		main.numUnread = 0;
		  		main.updateButton();
				main.openTab(config.urls.unreadMessage);
		  	}
		});
		//This should probably only run if the options.loadReason is an install
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
		request.Request({
			url: config.urls.unreadMessageJSON,
			onComplete: function (returned) {
				var response = returned.json;
				//check if logged in
				if (response.hasOwnProperty("data")) {
					//store the old number for comparison
					var oldNum = main.numUnread;
					//Store the array of messages
					//Let's make this smarter someday. I should store the timestamp of the newest message.
					var messages = response["data"]["children"];
					//Get the number
					main.numUnread = 0;
					//Count the number of messages
					for (var message in messages) {
						if (messages.hasOwnProperty(message)) {
							main.numUnread++;
						}
					}
					//There are no errors!
					main.error = false;
					//If the number is greater, alert the user
					if (main.numUnread > oldNum) {
						var numNew = main.numUnread - oldNum;
						//plurality
						if (numNew === 1) {
							var plural = "is";
						} else {
							var plural = "are";
						}
						main.notify("New Messages", "There " + plural +" " + numNew + " new message(s).", function() {
							main.openTab(config.urls.unreadMessage);
						});
					}
					main.updateButton();
				} else {
					//logged out
					main.numUnread = 0;
					if (!main.error) {
						main.notify("Error", config.errors.loggedOut, function() {
							main.openTab(config.urls.login);
						});
						main.error = true;
					}
					main.updateButton(main.numUnread);
				}
				//call again after set amount of time
				main.timer = timers.setTimeout(main.update, config.refreshTime);
			}
		}).get();
	},
	updateButton: function() {
		//change the badge
		if (main.numUnread >= 10) {
			main.addonButton.badge = "∞";
		} else {
			main.addonButton.badge = main.numUnread;
		}
		//change the icon
		if (main.numUnread > 0) {
			main.addonButton.type = "unread";
		} else {
			main.addonButton.type = "read";
		}
	},
	notify: function(title, text, callback, data) {
		//Only show notifications if the user wants them
		if (prefs.prefs.showNotifications) {
			notifications.notify({
				title: config.name + " - " + title,
			 	text: text,
			 	iconURL: config.icons.big,
			 	data: data,
			 	onClick: function(data) {
			 		if (typeof(callback) === 'function') {
			 			callback(data);
			 		}
			 	}
			});
		}
	},
	openTab: function(url) {
		//check if already open
		for each (var tab in tabs) {
			if (tab.url === url) {
				//reload and then switch to the tab
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