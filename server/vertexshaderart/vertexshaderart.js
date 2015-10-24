Art = new Mongo.Collection("art");
ArtLikes = new Mongo.Collection("artlikes");

//Artpages = new Meteor.Pagination(Art, {
//  itemTemplate: "artpiece",
//  templateName: "gallery",
//  route: "/gallery/",
//  router: "iron-router",
//  routerTemplate: "gallery",
//  routerLayout: "Layout",
//});

S_CURRENTLY_LOGGING_IN = "currentlyLoggingIn";
S_PENDING_LIKE = "pendingLike";
S_VIEW_STYLE = "viewstyle";
G_PAGE_SIZE = 3; //15; //3;
G_PAGE_RANGE = 2;
G_NUM_PAGE_BUTTONS = G_PAGE_RANGE * 2 + 1;

//FS.debug = true;
Images = new FS.Collection("images", {
  stores: [
    new FS.Store.FileSystem("images", {
      path: IMAGE_PATH,
      beforeWrite: function(fileObj) {
        fileObj.name("thumbnail.png");
        return {
          extension: 'png',
          type: 'image/png',
        };
      },
    }),
  ],
});

if (Meteor.isServer) {
  Images.allow({
    'insert': function() {
        // add custom authentication code here
        return true;
    },
    'download': function() {
         return true;
    },
  });

  Meteor.publish("art", function () {
    Counts.publish(this, 'artCount', Art.find({}));
    return Art.find({});
  });

  Meteor.publish("artlikes", function () {
    return ArtLikes.find({});
  });

  Meteor.publish("images", function () {
    return Images.find({});
  });



  var templateRE = /<template\s+name="(.*?)">([\s\S]*?)<\/template>/g;
  var ssrTemplates = Assets.getText('ssr-templates.html');
  do {
    var m = templateRE.exec(ssrTemplates);
    if (m) {
      SSR.compileTemplate(m[1], m[2]);
    }
  } while (m);

  var urlRE = /(.*?\:)\/\/(.*)$/;
  function parseUrl(url) {
    var u = {};
    var hashNdx = url.indexOf("#");
    if (hashNdx >= 0) {
      u.hash = url.substr(hashNdx);
      url = url.substr(0, hashNdx);
    }
    var searchNdx = url.indexOf("?");
    if (searchNdx >= 0) {
      u.search = url.substr(searchNdx);
      url = url.substr(0, searchNdx);
    }
    var m = urlRE.exec(url);
    if (m) {
      u.protocol = m[1];
      url = m[2];
    }
    var slashNdx = url.indexOf("/");
    if (slashNdx >= 0) {
      u.hostname = url.substr(0, slashNdx);
      u.pathname = url.substr(slashNdx);
    } else {
      u.host = other;
    }

    return u;
  }

  //var artPathRE = /\/art\/(.*)/;
  //WebApp.connectHandlers.use("/", function(req, res, next) {
  //   var url = parseUrl(req.url);
  //   if (url.pathname) {
  //     var m = artPathRE.exec(url.pathname);
  //     if (m) {
  //
  //     }
  //   }
  //   next();
  //});

//  Inject.meta("foo", "bar");
}

var pwd = AccountsTemplates.removeField('password');
AccountsTemplates.removeField('email');
AccountsTemplates.addFields([
  {
      _id: "username",
      type: "text",
      displayName: "username",
      required: true,
      minLength: 5,
  },
  {
      _id: 'email',
      type: 'email',
      required: true,
      displayName: "email",
      re: /.+@(.+){2,}\.(.+){2,}/,
      errStr: 'Invalid email',
  },
  {
      _id: 'username_and_email',
      type: 'text',
      required: true,
      displayName: "Login",
  },
  pwd
]);

if (Meteor.isClient) {
  Meteor.subscribe("art");
  Meteor.subscribe("images");
  Meteor.subscribe("artlikes");
  Session.set(S_VIEW_STYLE, "popular");
  Pages = new Mongo.Collection(null);

  Template.gallery.helpers({
    numImages: function() {
      return Images.find().count();
    },
    images: function() {
      return Images.find();
    },
    hideCompleted: function () {
      return Session.get("hideCompleted");
    },
    incompleteCount: function () {
      return Art.find({checked: {$ne: true}}).count();
    },
  });

  Template.artgrid.helpers({
    art: function () {
      var route = Router.current();
      var pageId = route.params._page || 1;
      var page = pageId - 1;
      var skip = page * G_PAGE_SIZE;
      var find = {};
      var sort;
      var cd = Template.currentData();
      if (cd && cd.user) {
        var pd = Template.parentData();
        if (pd && pd.username) {
          find = {username: pd.username};
        }
      }
      switch (Session.get(S_VIEW_STYLE)) {
        case "mostviewed":
          sort = { views: -1 };
          break;
        case "newest":
          sort = {createdAt: -1};
          break;
        case "popular":
        default:
          sort = { likes: -1 };
          break;
      }

      return Art.find(find, {
        fields: {settings: false},
        sort: sort,
        skip: skip,
        limit: G_PAGE_SIZE,
      });
      //if (Session.get("hideCompleted")) {
      //  // If hide completed is checked, filter tasks
      //  return Art.find({checked: {$ne: true}}, {sort: {createdAt: -1}});
      //} else {
      //  // Otherwise, return all of the tasks
      //  return Art.find({}, {sort: {createdAt: -1}});
      //}
    },
  });

  Template.gallery.events({
    "submit .new-art": function (event) {
      // Prevent default browser form submit
      event.preventDefault();

      // Get value from form element
      var text = event.target.text.value;

      // Insert a art into the collection
      Meteor.call("addArt", text);

      // Clear form
      event.target.text.value = "";
    },
    "change .hide-completed input": function (event) {
      Session.set("hideCompleted", event.target.checked);
    }
  });

  Template.artpiece.helpers({
    screenshotLink: function() {
      if (this.screenshotDataId) {
        return Images.findOne(({_id: this.screenshotDataId}));
      } else if (this.screenshotDataURL) {
        return { url:this.screenshotDataURL };
      } else {
        return { url:"/static/resources/images/missing-thumbnail.jpg" };
      }
    },
  });

  Template.artitem.helpers({
    isOwner: function () {
      return this.owner === Meteor.userId();
    }
  });

  Template.artitem.events({
    "click .toggle-checked": function () {
      // Set the checked property to the opposite of its current value
      Meteor.call("setChecked", this._id, ! this.checked);
    },
    "click .delete": function () {
      Meteor.call("deleteTask", this._id);
    },
    "click .toggle-private": function () {
      Meteor.call("setPrivate", this._id, ! this.private);
    },
  });

  Template.vslogin.helpers({
    currentlyLoggingIn: function() {
      var currentlyLoggingIn = Session.get(S_CURRENTLY_LOGGING_IN) && !Meteor.user();
      return currentlyLoggingIn;
    }
  });

  Template.vslogin.events({
    "click #vsloginback": function() {
      Session.set(S_CURRENTLY_LOGGING_IN, false);
      Session.set(S_PENDING_LIKE, false);
    },
    "click #vslogin": function(e) {
      e.stopPropagation();
    },
  });

  Template.userinfolike.helpers({
    likedByUser: function() {
      var route = Router.current();
      if (ArtLikes.findOne({artId: route.params._id, userId: Meteor.userId()})) {
        return true;
      } else {
        return false;
      }
    },
  });
  Template.userinfolike.events({
    "click #like.nouser": function() {
      Session.set(S_CURRENTLY_LOGGING_IN, true);
      Session.set(S_PENDING_LIKE, true);
    },
    "click #like.currentuser": function() {
      var route = Router.current();
      Meteor.call("likeArt", route.params._id);
    },
  });
  Template.userinfosignin.events({
    "click #user.nouser": function() {
      Session.set(S_CURRENTLY_LOGGING_IN, true);
    },
    "click #user.currentuser": function() {
      window.location.href = "/user/" + Meteor.user().username;
    },
  });

  Template.userprofile.helpers({
    editUsername: function() {
      return Session.get("editUsername");
    },
    userExists: function() {
      var route = Router.current();
      var username = route.params._username;
      if (Meteor.users.findOne({username: username})) {
        return true;
      }
      return false;
    },
  });

  Template.userprofile.events({
    "click .username": function() {
      var route = Router.current();
      if (Meteor.userId() &&
          Meteor.user().username === route.params._username) {
        Session.set("editUsername", true);
      }
    },
    "change .usernameedit": function(e) {
      if (Meteor.userId()) {
        var username = e.target.value.trim();
        Meteor.call("changeUsername", username, function(error) {
          if (!error) {
            Session.set("editUsername", false);
            Router.go("/user/" + username);
            return;
          }
        });
      }
    },
    "click .logout": function() {
       if (Meteor.userId()) {
         Meteor.logout();
       }
    },
  });

  Template.sorting.events({
    "click .sorting .popular": function() {
      Session.set(S_VIEW_STYLE, "popular");
    },
    "click .sorting .newest": function() {
      Session.set(S_VIEW_STYLE, "newest");
    },
    "click .sorting .mostviewed": function() {
      Session.set(S_VIEW_STYLE, "mostviewed");
    },
  });

  Template.sorting.helpers({
    selected: function(sortType) {
      return Session.get(S_VIEW_STYLE) === sortType ? "selected" : "";
    },
    pages: function() {
       var count = Counts.get("artCount");
       var cd = Template.currentData();
       var pd = Template.parentData();
       var pageId = pd.page;
       var path = cd ? cd.path : "foo";
       if (cd && cd.user) {
         if (pd && pd.username) {
           var username = pd.username;
           // HACK!!!
           path = "user/" + username;
           count = Art.find({username: username}).count();
           pageId = parseInt(pd.page || 1);
         }
       }
       var page = pageId - 1;
       var numPages = (count + G_PAGE_SIZE - 1) / G_PAGE_SIZE | 0;
       var lastPage = numPages - 1;
       Pages.remove({});
       if (numPages > 1) {
         var needPrevNext = numPages > G_NUM_PAGE_BUTTONS
         if (needPrevNext) {
           var prev = Math.max(page, 1);
           Pages.insert({path: path, pagenum: "<<", pageid: prev, samepageclass: this.page === prev ? "selected" : ""});
         }

         var min = page - G_PAGE_RANGE;
         var max = page + G_PAGE_RANGE;
         if (min < 0) {
           max = max - min;
           min = 0;
         }
         if (max > lastPage) {
           min = Math.max(0, min - (max - lastPage));
           max = lastPage;
         }
         for (var ii = min; ii <= max; ++ii) {
           Pages.insert({path: path, pagenum: ii + 1, pageid: ii + 1, samepageclass: ii === page ? "selected" : ""});
         }

         if (needPrevNext) {
           var next = Math.min(lastPage, page + 1);
           Pages.insert({path: path, pagenum: ">>", pageid: next + 1, samepageclass: page === next ? "selected" : ""});
         }
       }
       return Pages.find({});
    },
  });

  function SetArt(data) {
    var settings;
    if (data && data.settings) {
      try {
        settings = JSON.parse(data.settings);
      } catch (e) {
        console.log("could not parse settings");
      }
    } else {
      if (!data) {
        console.log("data not set");
      } else {
        console.log("data.settings not set for id:", data._id);
      }
    }
    if (!settings && window.location.pathname.substr(0, 5) !== "/new/") {
      settings = window.vsart.missingSettings;
    }
    window.vsart.setSettings(settings);
  }

  Template.artpage.onRendered(function() {
    SetArt(this.data);
  });

  Template.artpage.onDestroyed(function() {
    window.vsart.stop();
  });

  Template.artpage.events({
    "click #save": function() {
      window.vsart.markAsSaving();
      Meteor.call("addArt", {
        settings: window.vsart.getSettings(),
        screenshot: window.vsart.takeScreenshot(),
      });
    },
  });

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY",
  });

}

var mySubmitFunc = function(error, state){
  if (error) {
    console.log("login error");
  } else if (state === "signIn") {
      // Successfully logged in
      // ...
    console.log("sign in");
  } else  if (state === "signUp") {
      // Successfully registered
      // ...
    console.log("sign up");
  }
};

AccountsTemplates.configure({
    onSubmitHook: mySubmitFunc
});

Router.map(function() {
  this.route('/', {
    template: 'gallery',
    data: {
      page: 1,
    },
  });
  this.route('/gallery/:_page', {
    template: 'gallery',
    data: function() {
      return {
        page: parseInt(this.params._page),
      };
    },
  });
  this.route('/new/', function() {
    this.render('artpage');
  });
  this.route('/user/:_username', {
    template: 'userprofile',
    data: function() {
      return {
        page: 1,
        username: this.params._username,
      };
    },
  });
  this.route('/user/:_username/:_page', {
    template: 'userprofile',
    data: function() {
      return {
        page: parseInt(this.params._page),
        username: this.params._username,
      };
    },
  });
  this.route('/art/:_id', {
    template: 'artpage',
    waitOn: function() {
      return [Meteor.subscribe('art', this.params._id)];
    },
    data: function() {
      return Art.findOne({_id: this.params._id});
    },
    action: function() {
      //this.subscribe('art', this.params._id).wait();

      if (this.ready()) {
        Session.set(S_CURRENTLY_LOGGING_IN, false);
        this.render();
      } else {
        this.render('loading');
      }
    },
    onAfterAction: function() {
      if (!Meteor.isClient) {
        return;
      }

      // hard to decide what's the best way to do this
      // this just makes it not get into an infinite loop.
      // Do we care that if you just refresh the page it's a new view?
      // Youtube doesn't care so should I?
      var artId = this.params._id;
      var lastArtId = Session.get("view_art_id");
      if (artId !== lastArtId) {
        Session.set("view_art_id", artId);
        Meteor.call("incArtViews", artId);
      }
      //SEO.set({
      //  title: "foobar",
      //  meta: {
      //    'description': "foobar-desc",
      //  },
      //  og: {
      //    'title': this.params._id,
      //    'description': "foobar-desc",
      //  },
      //});

    },
  });
});

Meteor.methods({
  addArt: function (data) {
    // Make sure the user is logged in before inserting art
//    if (! Meteor.userId()) {
//      throw new Meteor.Error("not-authorized");
//    }
    var owner = Meteor.userId();
    var username = Meteor.userId() ? Meteor.user().username : "-anon-";
    var settings = data.settings || {};
    var screenshotDataURL = data.screenshot.dataURL || "";
    Images.insert(screenshotDataURL, function(err, fileObj) {
      Art.insert({
        createdAt: new Date(),
        owner: owner,
        username: username,
        settings: JSON.stringify(settings),
        screenshotDataId: fileObj._id,
        views: 0,
        likes: 0,
      }, function(error, result) {
         if (Meteor.isClient) {
           var url = "/art/" + result;
           window.history.replaceState({}, "", url);
           window.vsart.markAsSaved();
         }
      });
    });
  },
  likeArt: function(artId) {
     var userId = Meteor.userId();
     if (!userId) {
       throw new Meteor.Error("can not like something if not logged in");
     }
     var like = ArtLikes.findOne({artId: artId, userId: userId});
     if (like) {
       ArtLikes.remove(like._id);
     } else {
       ArtLikes.insert({artId: artId, userId: userId});
     }
     Art.update({_id: artId}, {$inc: {likes: like ? -1 : 1}});
  },
  changeUsername: function(username) {
    username = username.trim();
    if (!Meteor.userId()) {
      throw new Meteor.Error("please login to change your username");
    }
    if (!username) {
      throw new Meteor.Error("username is empty or mostly empty");
    }
    if (Meteor.user().username === username) {
      return;
    }
    if (!Meteor.isServer) {
      return;
    }
    try {
      Accounts.setUsername(Meteor.userId(), username);
    } catch(e) {
      console.log("could not set username");
      throw e;
    }
    Art.update({owner: Meteor.userId()}, {$set: {username: username}}, {multi: true});
  },
  //deleteArt: function (artId) {
  //  var art = Art.findOne(artId);
  //  if (art.private && art.owner !== Meteor.userId()) {
  //    // If the task is private, make sure only the owner can delete it
  //    throw new Meteor.Error("not-authorized");
  //  }
  //  Art.remove(artId);
  //},
  //setChecked: function (artId, setChecked) {
  //  var art = Art.findOne(artId);
  //  if (art.private && art.owner !== Meteor.userId()) {
  //    // If the task is private, make sure only the owner can check it off
  //    throw new Meteor.Error("not-authorized");
  //  }
  //
  //  Art.update(artId, { $set: { checked: setChecked} });
  //},
  //setPrivate: function (artId, setToPrivate) {
  //  var art = Art.findOne(artId);
  //
  //  // Make sure only the task owner can make a task private
  //  if (art.owner !== Meteor.userId()) {
  //    throw new Meteor.Error("not-authorized");
  //  }
  //
  //  Art.update(artId, { $set: { private: setToPrivate } });
  //},
  //testSSR: function() {
  //  if (Meteor.isServer) {
  //    var html = SSR.render("artSSR", {
  //      art: Art.find({}).fetch(),
  //    });
  //    console.log("-----\n", html);
  //  }
  //},
  incArtViews: function(artId) {
    Art.update({_id: artId}, {$inc: {views: 1}});
  },
});


Meteor.startup(function () {
 if(Meteor.isClient){
 }
 if(Meteor.isClient){
     // SEO.config({
     //   title: 'vertexshaderart.com',
     //   meta: {
     //     'apple-mobile-web-app-capable': "yes",
     //     'apple-mobile-web-app-status-bar-style': "black",
     //     'HandheldFriendly': "True",
     //     'MobileOptimized': "320",
     //     'viewport': "width=device-width, target-densitydpi=160dpi, initial-scale=1.0, minimal-ui",
     //     'description': 'vertexshaderart.com - realtime vertex shader art',
     //   },
     //   og: {
     //     'image': 'http://vertexshaderart.com/static/resources/images/vertexshaderart.png',
     //   },
     // });
 }
});


