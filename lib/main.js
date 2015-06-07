//Reddit Notifier main.js!
//This is where the magic happens

"use strict";

//Get dependencies
var data = require('sdk/self').data;
var prefs = require("sdk/simple-prefs");
var request = require("sdk/request");
var notifications = require("sdk/notifications");
var timers = require("sdk/timers");
var tabs = require("sdk/tabs");
var worker = require("sdk/page-worker");
var ui = require("sdk/ui");
var panels = require("sdk/panel");

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
		newPosts: {},
		unreadMessage: "http://www.reddit.com/message/unread.json",
		unreadModerator: "http://www.reddit.com/message/moderator/unread.json",
	},
	ignore: [],
	messages: {
		unreadMessage: "%x% new message(s)",
		unreadModerator: "%x% new moderator mail message(s)",
		newPosts: "There are new posts in: /r/%x%",
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
	timer: null,
	unread: {},
	numUnread: {},
	newUnread: {},
	totalUnread: 0,
	oldPostsTimes: {},
	newPostsTimes: {},
	openURL: config.urls.unreadMessage,
	//Called by the browser at runtime
	init: function(options, callbacks) {
		var self = this;
		//This function handles preferences
		prefs.on("", self.prefChange.bind(self));
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
				//this.state('window', null);
				//this.checked = false;
				//self.openUnreadTab();
				if (state.checked) {
					self.messagesPanel.show({
						position: self.addonButton
					});
					self.messagesPanel.port.emit("show", self.numUnread);
				}
			}
		});
		self.messagesPanel = panels.Panel({
			contentURL: data.url("panel/panel.html"),
			contentScriptFile: data.url("panel/panel.js"),
			onHide: function() {
				self.addonButton.state('window', {checked: false});
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
		for (var subreddit in config.unreadURLS.newPosts) {
			delete self.unread[subreddit];
		}
		config.unreadURLS.newPosts = {};
		//Check if user has set the subreddits pref
		if (prefs.prefs.subreddits !== undefined && prefs.prefs.subreddits.trim() !== "") {
			//split on comma
			var subreddits = prefs.prefs.subreddits.split(",");
			//loop through each subreddit and add it to the list
			for (var index in subreddits) {
				var subreddit = subreddits[index].trim();
				//Make sure user only put in a valid subreddit name
				if (subreddit.match(/^[a-zA-Z0-9]+$/)) {
					config.unreadURLS.newPosts[subreddit] = config.urls.newPostsJSON.replace("%subreddit%", subreddit);
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
		//Loop through the unread urls
		for (var key in config.unreadURLS) {
			//check to see if I should ignore this unread URL
			if (config.ignore.indexOf(key) === -1) {
				//Make sure the current url isn't an object
				if (typeof(config.unreadURLS[key]) !== "object") {
					self.runRequest(key);
				} else {
					//Loop through the urls in the object
					for (var subKey in config.unreadURLS[key]) {
						self.runRequest(subKey, key);
					}
				}
			//If we ignore this url, run the timeout
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
		//Run the request to reddit
		request.Request({
			url: url,
			onComplete: function(data) {
				self.countMessages(data, key, parentKey);
			}
		}).get();
		return self;
	},
	countMessages: function(data, key, parentKey = false) {
		var self = this;
		var response = data.json;
		//check if logged in
		if (response !== null && response.hasOwnProperty("data")) {
			//Store the array of messages
			var messages = response["data"]["children"];
			//Calculate the number of messages
			var unread = 0;
			var time = 0;
			//Count the number of messages
			for (var message in messages) {
				if (messages.hasOwnProperty(message)) {
					time = messages[message]["data"]["created_utc"];
					//If looping through subreddit, get the first post only
					if (parentKey) { break;	}
					unread++;
				}
			}
			var oldTotal = 0, oldTime = 0;
			if (self.unread[key]) {
				oldTotal = self.unread[key].total;
				oldTime = self.unread[key].time;
			}
			self.unread[key] = {total: unread, change: unread - oldTotal, time: (time > oldTime) ? time : oldTime, newer: time - oldTime, type: parentKey };
			console.log(key, self.unread[key]);
			//self.newUnread[key] = unread;
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
		var msg = "";
		var showMessage = false;
		for (var key in self.unread) {
			var unreadObj = self.unread[key];
			var message;
			if (unreadObj.type) {
				message = config.messages[unreadObj.type];
			} else {
				message = config.messages[key];
			}
			//If there are new messages from last time
			if (unreadObj.change > 0 || unreadObj.newer > 0) {
				if (unreadObj.type) {
					message = message.replace("%x%", key);
				} else {
					message = message.replace("%x%", self.unread[key].change);
				}
				showMessage = true;
				msg += message + "\n";
			}
			//Change the unread count for the key
			//self.numUnread[key] = self.newUnread[key];
		}
		/*
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
		*/
		//Only show message if there are new messages
		if (showMessage) {
			self.notify("New Messages", msg, true, self.openUnreadTab.bind(self));
		}
		//Refresh the button
		var buttonState = {type: "default", disabled: false};
		self.totalUnread = 0;
		for (var key in self.unread) {
			if (self.unread[key].type && (self.unread[key].newer > 0) {
				self.totalUnread++;
			} else {
				self.totalUnread += self.unread[key].total;
			}
		}
		if (self.totalUnread > 0) {
			buttonState.badge = self.totalUnread;
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
