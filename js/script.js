$(document).ready(function() {
    var mainCanvas = document.querySelector("#mainCanvas");
    var drawingPad = new DrawingPad(mainCanvas, {
        dotSize: 1,
        minWidth: 1,
        maxWidth: 1,
        penColor: "rgb(66, 133, 244)"
    });

    drawingPad.on();

    var saveButton = $("#saveButton")[0];
    var loadButton = $("#loadButton")[0];
    var downloadRef = $("#download")[0];

    $("#download").hide();
    saveButton.addEventListener("click", function () {
        var inkLines = drawingPad.getInkLines();

        var json = JSON.stringify(inkLines);
        var blob = new Blob([json], {type: "application/json"});
        var url  = URL.createObjectURL(blob);

        $("#download").show();
        downloadRef.download = "inks.json";
        downloadRef.href        = url;
        downloadRef.textContent = "Download inks.json";
    });

    loadButton.addEventListener("click", function () {
        // load from external chosen file
        
        $.getJSON("inks.json", function(json) {
            console.log(json); 

            // do stuff to make the ink display
        });
    });
});

