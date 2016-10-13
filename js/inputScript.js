$(document).ready(function() {
    $('#nextButton').click(function() {
        var codeText = $('#inputField').val();
        $('#inputField').css('visibility', 'hidden');
        $('#codeBlock').css('visibility', 'visible');
        $('#mainCanvas').css('visibility', 'visible');

        $('#codeBlock').text(codeText);
        $('pre code').each(function(i, block) {
            hljs.highlightBlock(block);
        });
    });
});