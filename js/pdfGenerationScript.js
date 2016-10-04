$(document).ready(function() {
    var cacheHeight = $('#drawing-canvas').height();
    var pdfCanvas = $('#code-canvas');

    var pdfSize = [pdfCanvas.width(), pdfCanvas.height()];

    $('#pdfButton').click(function() {
        $('#drawing-canvas').height(pdfCanvas.height());
        html2canvas($('#drawing-canvas'), {
            onrendered: function(canvas) {
                var img = canvas.toDataURL("image/JPEG");
                var pdf = new jsPDF('l', 'pt', pdfSize);
                pdf.addImage(img, 'JPEG', 20, 20);
                pdf.save("testingPDF");
                $('#drawing-canvas').height(cacheHeight);
            }
        });
        // pdf.addHTML($('#drawing-canvas')[0], function() {
        //     pdf.save("testingPDF");
        // });
    });



    // var form = $('#testingID');
    // //var cache_width = form.width;
    // //var ipad = [2048, 1536];

    // $('#pdfButton').click(function() {
    //     $('body').scrollTop(0);
    //     createPDF();
    // });

    // function createPDF() {
    //     getCanvas().then(function(canvas) {
    //         alert("DIFODSF");
    //         var img = canvas.toDataURL("image/png");
    //         var doc = new jsPDF({
    //             unit:'px',
    //             format:'ipad'
    //         });
    //         doc.addImage(img, 'JPEG', 20, 20);
    //         doc.save('testingPDF');
    //         //form.width(cache_width);
    //     });
    // }
    
    // function getCanvas() {
    //     return html2canvas(form, {
    //         imageTimeout:2000,
    //         removeContainer:true
    //     });
    // }
    
    // var specialElementsHandlers = {
    //     '#editor' : function(element, renderer) {
    //         return true;
    //     }
    // };

    // $('#pdfButton').click(function() {
    //     var doc = new jsPDF();
    //     doc.fromHTML($('#testingid').html(), 15, 15, {
    //         'width' : 170, 'elementHandlers' : specialElementsHandlers
    //     });
    //     doc.save("testPDF.pdf");
    // });
});