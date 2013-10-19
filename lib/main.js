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
		install: "http://bradleyrosenfeld.com/RedditNotifier",
		newPosts: "http://www.reddit.com/r/%subreddit%/new/",
		newPostsJSON: "http://www.reddit.com/r/%subreddit%/new.json",
		subreddits: {}
	},
	unreadURLS: {
		subreddits: {},
		unreadMessage: "http://www.reddit.com/message/unread.json",
		unreadModerator: "http://www.reddit.com/message/moderator/unread.json",
	},
	messages: {
		unreadMessage: "%num% new message(s)",
		unreadModerator: "%num% new moderator mail message(s)",
		subreddit: "There are new posts in: /r/%subname%",
		loggedOut: "It looks like you are logged out of Reddit.\nTry logging in."
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
	totalUnread: 0,
	oldPostsTimes: {},
	newPostsTimes: {},
	//Error notification is shown when false, errors set to true to allow for linking to login URL at start
	error: false,
	errors: true,
	openURL: config.urls.unreadMessage,
	//Called by the browser at runtime
	init: function(options, callbacks) {
		//If the user has set subreddits to check for new posts, load them up
		main.loadSubreddits();
		//create button for refreshing/opening inbox
		main.addonButton = toolbarbutton.ToolbarButton({
			id: config.toolbar.id,
		  	label: config.name,
		  	tooltiptext: config.toolbar.tooltip,
		  	textColor: config.toolbar.textColor,
		  	backgroundColor: config.toolbar.backgroundColor,
		  	badge: 0,
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
			timers.setTimeout(main.install, config.delayLoad);
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
	loadSubreddits: function() {
		//Check if user has set the subreddits pref
		if (prefs.prefs.subreddits !== undefined && prefs.prefs.subreddits.trim() !== "") {
			//clear the old subs and remake the url list
			config.unreadURLS.subreddits = {};
			oldPostsTimes = {};
			newPostsTimes = {};
			//split on comma
			var subreddits = prefs.prefs.subreddits.split(", ");
			//loop through each subreddit and add it to the list
			for (var index in subreddits) {
				var subreddit = subreddits[index];
				//Make sure user only put in a valid subreddit name
				if (subreddit.match(/^[a-zA-Z0-9]+$/)) {
					config.unreadURLS.subreddits[subreddit] = config.urls.newPostsJSON.replace("%subreddit%", subreddit);
				}
			}
		}
	},
	update: function() {
		timers.clearTimeout(main.timer);
		//change the button icon to reflect the refresh
		main.addonButton.type = "refresh";
		//runs the request, calls the updateButton function
		for (key in config.unreadURLS) {
			function runRequest(key, parentKey) {
				var url = config.unreadURLS[key];
				if (parentKey) {
					url = config.unreadURLS[parentKey][key];
				}
				request.Request({
					url: url,
					onComplete: function (returned) {
						var response = returned.json;
						//check if logged in
						if (response !== null && response.hasOwnProperty("data")) {
							//Store the array of messages
							var messages = response["data"]["children"];
							//Get the number
							main.newUnread[key] = 0;
							//Count the number of messages
							for (var message in messages) {
								if (messages.hasOwnProperty(message)) {
									//If looping through subreddit, get the first post only
									if (parentKey) {
										main.newPostsTimes[key] = messages[message]["data"]["created_utc"];
										break;
									}
									main.newUnread[key]++;
								}
							}
							if (!parentKey) {
								main.errors = false;
								main.error = false;
							}
						} else if (!parentKey) {
							main.errors = true;
						}
						//check if last URL to check
						var keys = Object.keys(config.unreadURLS);
						if (!parentKey && key === keys[keys.length - 1]) {
							//Keys aren't always looped in order, so delay for one second to compensate
							//This will fix most failures to register new messages
							//Kind of hacky as it is, but meh.
							timers.setTimeout(main.showMessages, 1000);
						}
					}
				}).get();
			}
			if (key !== "subreddits" && typeof(config.unreadURLS[key]) === "string") {
				runRequest(key);
			} else {
				for (var subKey in config.unreadURLS[key]) {
					runRequest(subKey, key);
				}
			}
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
			//Loop through subreddits
			for (var key in main.newPostsTimes) {
				if (main.newPostsTimes[key] > main.oldPostsTimes[key]) {
					if (!showMessage) {
						main.openURL = config.urls.newPosts.replace("%subreddit%", key);
					}
					msg += config.messages["subreddit"].replace("%subname%", key) + "\n";
					main.oldPostsTimes[key] = main.newPostsTimes[key];
					main.totalUnread++;
					showMessage = true;
				//set the baseline
				} else if (main.oldPostsTimes[key] === undefined) {
					main.oldPostsTimes[key] = main.newPostsTimes[key];
				}
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
		//start with what is set
		var numUnread = main.totalUnread;
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
		main.totalUnread = 0;
  		var greatestNumMessages = 0;
		if (!main.errors) {
	  		for (var key in main.numUnread) {
	  			//decide which URL to open
	  			//Whichever URL has the greatest number of unread messages
	  			if (main.numUnread[key] > greatestNumMessages) {
	  				greatestNumMessages = main.numUnread[key];
	  				main.openURL = config.urls[key];
		  			//reset the count
		  			main.numUnread[key] = 0;
	  			}
	  		}
  		} else {
  			main.openURL = config.urls.login;
  		}
  		main.updateButton();
		main.openTab(main.openURL);
		//reset url
		main.openURL = config.urls.unreadMessage;
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
				//Sound from http://freesound.org/people/KIZILSUNGUR/sounds/72127/
				//Thanks KIZILSUNGUR!
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
			config.refreshTime = prefs.prefs[name]*1000 - 1000;
		} else {
			config.refreshTime = 29000;
		}
	}
}

exports.main = main.init;
//This function verifies the user input
prefs.on("timing", main.timingOption);
//load subreddits to check for new posts
prefs.on("subreddits", main.loadSubreddits);