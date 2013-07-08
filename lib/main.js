//Reddit Notifier - v0.1

//Get dependencies
const data = require('self').data;
var prefs = require("sdk/simple-prefs");
//var widget = require("sdk/widget");
var request = require("sdk/request");
var notifications = require("sdk/notifications");
var windowutils = require("window-utils");
var toolbarbutton = require("./toolbarbutton");
var userstyles = require("./userstyles");

var config = {
	name: "RedditNotifier",
	unreadURL: "http://www.reddit.com/message/unread.json",
	icons: {
		big: data.url("reddit-notifier-icon.png"),
		small: data.url("reddit-notifier-icon-small.png"),
		smallUnread: data.url("reddit-notifier-icon-small-unread.png")
	},
	toolbar: {
		id: "redditnotifierbutton",
		tooltip: "Click to open inbox, middle click to refresh",
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

	init: function(options, callbacks) {
		//do stuff on load of the addon
		main.onLoad(options.loadReason);

		console.log(main.requestUnread());
	},
	onLoad: function(loadReason) {
		console.log(loadReason);
		//create button for refreshing/opening inbox
		main.addonButton = toolbarbutton.ToolbarButton({
			id: config.toolbar.id,
		  	label: config.name,
		  	tooltiptext: config.toolbar.tooltip,
		  	textColor: config.toolbar.textColor,
		  	backgroundColor: config.toolbar.backgroundColor,
		  	onClick: function (e) {
		  		if (e.button == 1 || (e.button == 0 && e.ctrlKey)) {
		  			console.log("Middle click");
		  			main.addonButton.badge = main.requestUnread();
		  		}
		  	},
		  	onCommand: function () {
				console.log("Clicked");
		  	}
		});
		//This should probably only run if the loadReason is an install
		if (loadReason) {
			main.addonButton.moveTo(config.toolbar.move);
		}
		//Sets the image and such
		userstyles.load(data.url("overlay.css"));
	},
	requestUnread: function() {
		request.Request({
			url: config.unreadURL,
			onComplete: function (response) {
				if ("data" in response) {
					var data = response["data"]["children"];
					console.log(data.length);
				} else {
					console.log("Looks like you are logged out");
				}
			}
		}).get();
		//Testing
		return 1;
	}
}

exports.main = main.init;