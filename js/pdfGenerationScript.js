$(document).ready(function () {
    $('#pdfButton').click(function () {
        var cacheHeight = $('#canvasWrapper').height();
        var pdfCanvas = $('#codeBlock');
        var pdfHeight = pdfCanvas.height() + 100;

        var pdfPtHeight = pdfHeight * 0.75;

        var pdfSize = [pdfPtHeight, 700];
        swal({
            title: "PDF Name",
            text: "Please specify a name for the PDF.",
            type: "input",
            showCancelButton: true,
            closeOnConfirm: true,
            animation: "slide-from-top",
            inputPlaceholder: "PDF Name"
        },
            function (pdfName) {
                if (pdfName === false) {
                    return false;
                }
                if (pdfName === "") {
                    swal.showInputError("Please specify a name for the PDF.");
                    return false;
                }
                $('#canvasWrapper').height(pdfHeight);
                var orientation = "";
                if(pdfCanvas.height() > pdfCanvas.width()) {
                    orientation = "p";
                } else {
                    orientation = "l"
                }
                html2canvas($('#canvasWrapper'), {
                    onrendered: function (canvas) {
                        var img = canvas.toDataURL("image/JPEG");
                        var pdf = new jsPDF(orientation, 'pt', pdfSize);
                        pdf.addImage(img, 'JPEG', 20, 20);
                        pdf.save(pdfName + ".pdf");
                        $('#canvasWrapper').height(cacheHeight);
                    }
                });
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