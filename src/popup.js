chrome.runtime.getBackgroundPage(bg => {
  bg.pagebook.findAll().then(results => {
    console.log(results);
  });
});
