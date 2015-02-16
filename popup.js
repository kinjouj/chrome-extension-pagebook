(function() {
  "use strict";

  chrome.runtime.getBackgroundPage(function(bg) {
    var pagebook = bg.pagebook;
    pagebook.findAll().then(function(results) {
      React.renderComponent(
        React.createClass({
          render: function() {
            var pages = [];

            results.map(function(result) {
              var page = React.DOM.a(
                {
                  href: result.url,
                  target: "_blank"
                },
                result.title
              );

              pages.push(React.DOM.div({ className: "page" }, page));
            });

            return React.DOM.div(null, pages);
          }
        })({}),
        document.getElementById("pagebook")
      );
    });
  });
})();
