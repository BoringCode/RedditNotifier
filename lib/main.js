//Reddit Notifier - v0.1

//Get dependencies
var data = require('self').data;
var prefs = require("sdk/simple-prefs");
var widget = require("widget");
var request = require("sdk/request");
var notifications = require("notifications");
var windowutils = require("window-utils");
var userstyles = require("./userstyles");
var toolbarbutton = require("./toolbarbutton");

var main = {
	//settings
	unreadURL: "http://www.reddit.com/message/unread.json",
	icon: data.url("icon.png"),
	iconSmall: data.url("icon-small.png"),
	buttonJS: data.url('button.js'),

	addonButton: null,

	init: function() {
		console.log("Started");
		console.log(main.requestUnread());

		main.addonButton = toolbarbutton.ToolbarButton({
		  id: "reddit-notifier",
		  label: "RedditNotifier",
		  tooltiptext: "Some tooltip",
		  image: main.iconSmall,
		  onClick: function (e) {
		  	//Linux problem for onClick
		    if (e.button == 1 || (e.button == 0 && e.ctrlKey)) {
		      e.preventDefault();
		      e.stopPropagation();
		      console.log("test");
		      console.log(main.requestUnread());
		    }
		  },
		});
	},
	requestUnread: function() {
		request.Request({
			url: main.unreadURL,
			onComplete: function (response) {
				if ("data" in response) {
					var data = response["data"]["children"];
					console.log(data.length);
				} else {
					console.log("Looks like you are logged out");
				}
			}
		}).get();
		return 1;
	}
}

exports.main = main.init;