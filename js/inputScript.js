$(document).ready(function() {
    $('#nextButton').click(function() {
        var codeText = $('#inputField').val();
        $('#inputField').css('visibility', 'hidden');
        $('#codeWrapper').css('visibility', 'visible');
        $('#mainCanvas').css('visibility', 'visible');

        $('#codeWrapper').text(codeText);
        $('pre code').each(function(i, block) {
            hljs.highlightBlock(block);
        });
    });
});