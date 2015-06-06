//Reddit Notifier main.js!
//This is where the magic happens

//Get dependencies
var data = require('sdk/self').data;
var prefs = require("sdk/simple-prefs");
var request = require("sdk/request");
var notifications = require("sdk/notifications");
var timers = require("sdk/timers");
var tabs = require("sdk/tabs");
var windowutils = require("sdk/window/utils");
var worker = require("sdk/page-worker");
var ui = require("sdk/ui");

var config = {
	name: "RedditNotifier",
	urls: {
		unreadMessage: "http://www.reddit.com/message/unread/",
		unreadModerator: "http://www.reddit.com/message/moderator/unread/",
		login: "https://ssl.reddit.com/login",
		install: "http://bradleyrosenfeld.com/RedditNotifier",
		newPosts: "http://www.reddit.com/r/%subreddit%/new/",
		newPostsJSON: "http://www.reddit.com/r/%subreddit%/new.json",
	},
	unreadURLS: {
		subreddits: {},
		unreadMessage: "http://www.reddit.com/message/unread.json",
		unreadModerator: "http://www.reddit.com/message/moderator/unread.json",
	},
	ignore: [],
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
		default: {
			"16": data.url("icon/default/icon-16.png"),
			"32": data.url("icon/default/icon-32.png"),
			"64": data.url("icon/default/icon-64.png"),
		},
		reload: {
			"16": data.url("icon/reload/icon-16.png"),
			"32": data.url("icon/reload/icon-32.png"),
			"64": data.url("icon/reload/icon-64.png"),
		},
		unread: {
			"16": data.url("icon/unread/icon-16.png"),
			"32": data.url("icon/unread/icon-32.png"),
			"64": data.url("icon/unread/icon-64.png"),
		},
		logo: data.url("icon-logo.png")
	},
	alert: "alert.wav",
	volume: prefs.prefs.volume*0.01,
	toolbar: {
		id: "redditnotifierbutton",
		tooltip: "RedditNotifier\nClick to open inbox",
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
		var self = this;
		//This function handles preferences
		prefs.on("", self.prefChange);
		if (prefs.prefs.modMail === false) {
			config.ignore.push("unreadModerator");
		}
		if (prefs.prefs.checkMail === false) {
			console.log("Ignoring unread messages");
			config.ignore.push("unreadMessage");
		}
		//If the user has set subreddits to check for new posts, load them up
		self.loadSubreddits();
		//create button for refreshing/opening inbox
		self.addonButton = ui.ToggleButton({
			id: config.toolbar.id,
			label: config.toolbar.tooltip,
			icon: config.icons.default,
			badgeColor: "#336699",
			onChange: function(state) {
				this.state('window', null);
				this.checked = false;
				self.openUnreadTab();
			}
		});
		//first run or update
		if (options.loadReason === "install" || options.loadReason === "upgrade") {
			timers.setTimeout(self.install.bind(self), config.delayLoad);
		}
		//run the for the first time, don't do it right when the browser loads though
		self.timer = timers.setTimeout(self.update.bind(self), config.delayLoad);
		return self;
	},
	loadSubreddits: function() {
		var self = this;
		//clear the old subs and remake the url list
		self.oldPostsTimes = {};
		self.newPostsTimes = {};
		config.unreadURLS.subreddits = {};
		//Check if user has set the subreddits pref
		if (prefs.prefs.subreddits !== undefined && prefs.prefs.subreddits.trim() !== "") {
			//split on comma
			var subreddits = prefs.prefs.subreddits.split(",");
			//loop through each subreddit and add it to the list
			for (var index in subreddits) {
				var subreddit = subreddits[index].trim();
				//Make sure user only put in a valid subreddit name
				if (subreddit.match(/^[a-zA-Z0-9]+$/)) {
					config.unreadURLS.subreddits[subreddit] = config.urls.newPostsJSON.replace("%subreddit%", subreddit);
				}
			}
		}
		return self;
	},
	update: function() {
		var self = this;
		timers.clearTimeout(self.timer);
		//change the button icon to reflect the refresh
		self.updateButton({type: "reload", disabled: true})
		//runs the request, calls the updateButton function
		for (key in config.unreadURLS) {
			//check to see if I should ignore this unread URL
			if (config.ignore.indexOf(key) === -1) {
				if (key !== "subreddits" && typeof(config.unreadURLS[key]) === "string") {
					self.runRequest(key);
				} else {
					for (var subKey in config.unreadURLS[key]) {
						self.runRequest(subKey, key);
					}
				}
			} else {
				var keys = Object.keys(config.unreadURLS);
				if (key === keys[keys.length - 1]) {
					//Keys aren't always looped in order, so delay for one second to compensate
					//This will fix most failures to register new messages
					//Kind of hacky as it is, but meh.
					timers.setTimeout(self.showMessages.bind(self), 1000);
				}
			}
		}
		return self;
	},
	runRequest: function(key, parentKey) {
		var self = this;
		var url = config.unreadURLS[key];
		if (parentKey) {
			url = config.unreadURLS[parentKey][key];
		}
		request.Request({
			url: url,
			onComplete: function(returned) {
				self.countMessages(returned, key, parentKey);
			}
		}).get();
		return self;
	},
	countMessages: function(returned, key, parentKey) {
		var self = this;
		var response = returned.json;
		//check if logged in
		if (response !== null && response.hasOwnProperty("data")) {
			//Store the array of messages
			var messages = response["data"]["children"];
			//Get the number
			self.newUnread[key] = 0;
			//Count the number of messages
			for (var message in messages) {
				if (messages.hasOwnProperty(message)) {
					//If looping through subreddit, get the first post only
					if (parentKey) {
						self.newPostsTimes[key] = messages[message]["data"]["created_utc"];
						break;
					}
					self.newUnread[key]++;
				}
			}
			if (!parentKey) {
				self.errors = false;
				self.error = false;
			}
		} else if (!parentKey) {
			self.errors = true;
		}
		//check if last URL to check
		var keys = Object.keys(config.unreadURLS);
		if (!parentKey && key === keys[keys.length - 1]) {
			//Keys aren't always looped in order, so delay for one second to compensate
			//This will fix most failures to register new messages
			//Kind of hacky as it is, but meh.
			timers.setTimeout(self.showMessages.bind(self), 1000);
		}
		return self;
	},
	showMessages: function() {
		var self = this;
		if (!self.errors) {
			var msg = "";
			var showMessage = false;
			for (var key in self.newUnread) {
				var numNew = 0;
				//If the number is greater, alert the user
				if (self.newUnread[key] > self.numUnread[key]) {
					numNew = self.newUnread[key] - self.numUnread[key];
				} else if (self.numUnread[key] === undefined) {
					numNew = self.newUnread[key];
				}
				//Create message
				if (numNew > 0) {
					msg += config.messages[key].replace("%num%", numNew) + "\n";
					showMessage = true;
				}
				//Change the unread count for the key
				self.numUnread[key] = self.newUnread[key];
			}
			//Loop through subreddits
			for (var key in self.newPostsTimes) {
				if (self.newPostsTimes[key] > self.oldPostsTimes[key]) {
					if (!showMessage) {
						self.openURL = config.urls.newPosts.replace("%subreddit%", key);
					}
					msg += config.messages["subreddit"].replace("%subname%", key) + "\n";
					self.oldPostsTimes[key] = self.newPostsTimes[key];
					self.totalUnread++;
					showMessage = true;
				//set the baseline
				} else if (self.oldPostsTimes[key] === undefined) {
					self.oldPostsTimes[key] = self.newPostsTimes[key];
				}
			}
			//Only show message if there are new messages
			if (showMessage) {
				self.notify("New Messages", msg, true, self.openUnreadTab.bind(self));
			}
		//logged out
		} else {
			//Reset unread counts
			for (key in self.numUnread) {
				self.numUnread[key] = 0;
			}
			//Check to see if this message has been displayed already
			if (!self.error) {
				self.notify("Error", config.messages.loggedOut, false, function() {
					self.openTab(config.urls.login);
				});
				self.error = true;
			}
		}
		//Refresh the button
		var buttonState = {type: "default", disabled: false};
		var numUnread = self.totalUnread;
		for (var key in self.numUnread) {
			numUnread += self.numUnread[key];
		}
		if (numUnread > 0) {
			buttonState.badge = numUnread;
			buttonState.type = "unread";
		}
		self.updateButton(buttonState);
		//Call update function again after set amount of time
		self.timer = timers.setTimeout(self.update.bind(self), config.refreshTime);
		return self;
	},
	updateButton: function(opts) {
		var self = this;
		if (!opts) return self;
		if (opts.type) {
			self.addonButton.icon = config.icons[opts.type];
		}
		self.addonButton.disabled = opts.disabled;
		if (opts.badge) {
			self.addonButton.badge = opts.badge;
		} else {
			self.addonButton.badge = null;
		}
		return self;
	},
	openUnreadTab: function () {
		var self = this;
		self.totalUnread = 0;
  		var greatestNumMessages = 0;

		if (!self.errors) {
	  		for (var key in self.numUnread) {
	  			//decide which URL to open
	  			//Whichever URL has the greatest number of unread messages
	  			if (self.numUnread[key] > greatestNumMessages) {
	  				greatestNumMessages = self.numUnread[key];
	  				self.openURL = config.urls[key];
		  			//reset the count
		  			self.numUnread[key] = 0;
	  			}
	  		}
  		} else {
  			self.openURL = config.urls.login;
  		}
  		//Refresh the button
  		self.updateButton({type: "default", disabled: false});
		self.openTab(self.openURL);
		//reset url
		self.openURL = config.urls.unreadMessage;
		return self;
  	},
	install: function() {
		var self = this;
		self.openTab(config.urls.install);
		return self;
	},
	notify: function(title, text, alert, callback, passData) {
		var self = this;
		//Only show notifications if the user wants them
		if (prefs.prefs.showNotifications) {
			//Only play sound if user wants them and alert is true
			//Errors are silent
			if (prefs.prefs.playAlert && alert) {
				//play a sound on a page worker
				//Sound from http://freesound.org/people/KIZILSUNGUR/sounds/72127/
				//Thanks KIZILSUNGUR!
				worker.Page({
					contentScript: "var audio = new Audio('" + config.alert + "'); audio.volume = " + config.volume + "; audio.play();",
					contentURL: data.url("alert/alert.html")
				});
			}
			notifications.notify({
				title: config.name + " - " + title,
			 	text: text,
			 	iconURL: config.icons.unread["64"],
			 	data: passData,
			 	onClick: function(passData) {
			 		if (typeof(callback) === 'function') {
			 			callback(passData);
			 		}
			 	}
			});
		}
		return self;
	},
	openTab: function(url) {
		var self = this;
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
		return self;
	},
	prefChange: function(name) {
		var self = this;
		var pref = prefs.prefs[name];
		if (name === "timing") {
			//Change the refresh time to the new value
			if (pref >= 10) {
				config.refreshTime = pref*1000 - 1000;
			} else {
				config.refreshTime = 9000;
			}
		} else if (name === "volume") {
			//Change the volume
			if (pref <= 100) {
				config.volume = pref*0.01;
			} else {
				config.volume = 1;
			}
		} else if (name === "modMail") {
			if (pref === false) {
				config.ignore.push("unreadModerator");
				self.newUnread["unreadModerator"] = 0;
			} else {
				delete config.ignore[config.ignore.indexOf("unreadModerator")];
			}
		} else if (name === "checkMail") {
			if (pref === false) {
				config.ignore.push("unreadMessage");
				self.newUnread["unreadMessage"] = 0;
			} else {
				delete config.ignore[config.ignore.indexOf("unreadMessage")];
			}
		} else if (name === "subreddits") {
			self.loadSubreddits();
		}
		return self;
	},
};

exports.main = function(options, callback) {
	main.init(options, callback);
}
