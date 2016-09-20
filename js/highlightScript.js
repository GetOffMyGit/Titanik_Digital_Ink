$(document).ready(function() {
    $('div.code-wrapper').each(function(i, block) {
        hljs.highlightBlock(block);
    });
});

