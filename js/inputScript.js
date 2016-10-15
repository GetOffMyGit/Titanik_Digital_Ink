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
        $('#nextButton').css('visibility', 'hidden');
        $('#backButton').css('visibility', 'visible');
    });

    $('#backButton').click(function() {
        $('#inputField').css('visibility', 'visible');
        $('#codeBlock').css('visibility', 'hidden');
        $('#mainCanvas').css('visibility', 'hidden');

        $('#nextButton').css('visibility', 'visible');
        $('#backButton').css('visibility', 'hidden');
    });
});