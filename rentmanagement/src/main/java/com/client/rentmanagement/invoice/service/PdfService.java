package com.client.rentmanagement.invoice.service;

import com.client.rentmanagement.invoice.entity.Invoice;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.lowagie.text.*;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.awt.Color;

@Service
public class PdfService {

    public byte[] generateInvoicePdf(Invoice invoice) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 36, 36, 36, 36); 
        PdfWriter.getInstance(document, out);

        document.open();

        // 1. Building & Owner Header
        Font buildingFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 22, new Color(0, 51, 102));
        Paragraph buildingName = new Paragraph("MY BUILDING HEIGHTS", buildingFont);
        buildingName.setAlignment(Element.ALIGN_CENTER);
        document.add(buildingName);

        Font ownerHeaderFont = FontFactory.getFont(FontFactory.HELVETICA, 10, Color.BLACK);
        Paragraph ownerHeader = new Paragraph("Owner: Landlord | Contact: +91 9999999999", ownerHeaderFont);
        ownerHeader.setAlignment(Element.ALIGN_CENTER);
        ownerHeader.setSpacingAfter(5f);
        document.add(ownerHeader);

        Font subTitleFont = FontFactory.getFont(FontFactory.HELVETICA, 12, Color.GRAY);
        Paragraph subTitle = new Paragraph("Monthly Rent & Utility Invoice", subTitleFont);
        subTitle.setAlignment(Element.ALIGN_CENTER);
        document.add(subTitle);
        
        document.add(new Paragraph(" ")); 
        document.add(new Paragraph("---------------------------------------------------------------------------------------"));

        // 2. Tenant Details
        PdfPTable infoTable = new PdfPTable(2);
        infoTable.setWidthPercentage(100);
        infoTable.getDefaultCell().setBorder(Rectangle.NO_BORDER);
        infoTable.setSpacingBefore(10f);

        String name = invoice.getTenantName() != null ? invoice.getTenantName().toUpperCase() : "N/A";
        String room = invoice.getRoomNo() != null ? invoice.getRoomNo() : "N/A";

        infoTable.addCell(new Phrase("TENANT: " + name, FontFactory.getFont(FontFactory.HELVETICA_BOLD)));
        infoTable.addCell(new Phrase("ROOM NO: " + room, FontFactory.getFont(FontFactory.HELVETICA_BOLD)));
        infoTable.addCell(new Phrase("BILLING MONTH: " + invoice.getBillingMonth().getMonth() + " " + invoice.getBillingMonth().getYear()));
        infoTable.addCell(new Phrase("INVOICE DATE: " + invoice.getCreatedAt().toLocalDate())); 

        document.add(infoTable);

        // 3. Meter Table
        Paragraph meterHeading = new Paragraph("METER DETAILS", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10));
        meterHeading.setSpacingBefore(20f); 
        meterHeading.setSpacingAfter(5f);   
        document.add(meterHeading);

        PdfPTable meterTable = new PdfPTable(3);
        meterTable.setWidthPercentage(100);
        addTableHeader(meterTable, "PREVIOUS READING");
        addTableHeader(meterTable, "CURRENT READING");
        addTableHeader(meterTable, "UNITS CONSUMED");
        meterTable.addCell(createReadingCell(String.valueOf(invoice.getPreviousReading())));
        meterTable.addCell(createReadingCell(String.valueOf(invoice.getCurrentReading())));
        meterTable.addCell(createReadingCell(String.valueOf(invoice.getUnitsConsumed())));
        document.add(meterTable);

        // 4. Particulars Table
        Paragraph particularsHeading = new Paragraph("PARTICULARS", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10));
        particularsHeading.setSpacingBefore(20f);
        document.add(particularsHeading);

        PdfPTable table = new PdfPTable(2);
        table.setWidthPercentage(100);
        table.setWidths(new float[]{3f, 1f});
        table.setSpacingBefore(5f); 

        addTableHeader(table, "PARTICULARS");
        addTableHeader(table, "AMOUNT");
        addTableCell(table, "Monthly Room Rent", false);
        addTableCell(table, "INR " + String.format("%.2f", invoice.getRoomRent()), true);
        addTableCell(table, "Electricity Charges (Personal Meter)", false);
        addTableCell(table, "INR " + String.format("%.2f", invoice.getElectricityCharge()), true);
        addTableCell(table, "Common Area Electricity Share", false);
        addTableCell(table, "INR " + String.format("%.2f", invoice.getCommonAreaCharge()), true);

        PdfPCell totalLabel = new PdfPCell(new Phrase("TOTAL PAYABLE AMOUNT", FontFactory.getFont(FontFactory.HELVETICA_BOLD)));
        totalLabel.setBackgroundColor(new Color(230, 230, 230));
        totalLabel.setPadding(8);
        table.addCell(totalLabel);

        PdfPCell totalVal = new PdfPCell(new Phrase("INR " + String.format("%.2f", invoice.getTotalAmount()), FontFactory.getFont(FontFactory.HELVETICA_BOLD)));
        totalVal.setBackgroundColor(new Color(230, 230, 230));
        totalVal.setHorizontalAlignment(Element.ALIGN_RIGHT);
        totalVal.setPadding(8);
        table.addCell(totalVal);
        document.add(table);
        
        // 5. Payment Section: FIXED ALIGNMENT
        document.add(new Paragraph(" "));
        Paragraph paymentHeader = new Paragraph("PAYMENT DETAILS", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10));
        paymentHeader.setSpacingBefore(20f);
        paymentHeader.setSpacingAfter(5f);
        document.add(paymentHeader);

        PdfPTable paymentTable = new PdfPTable(2);
        paymentTable.setWidthPercentage(100);
        paymentTable.setWidths(new float[]{2.5f, 1f}); // Balanced widths

        // LEFT CELL: Text Details
        PdfPCell textCell = new PdfPCell();
        textCell.setPadding(15f);
        textCell.setBackgroundColor(new Color(245, 248, 255));
        textCell.setBorderColor(new Color(0, 51, 102));
        textCell.setVerticalAlignment(Element.ALIGN_MIDDLE); // Correct vertical centering

        // Payee Name
        Paragraph pName = new Paragraph("Landlord Name", ownerHeaderFont);
        pName.setSpacingAfter(10f); // Space between name and link
        textCell.addElement(pName);

        // Clickable UPI Link
        String upiUri = "upi://pay?pa=landlord@upi&pn=Landlord%20Name&am=" + invoice.getTotalAmount() + "&cu=INR";
        Anchor upiAnchor = new Anchor("UPI ID: landlord@upi", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11, Color.BLUE));
        upiAnchor.setReference(upiUri);
        Paragraph pLink = new Paragraph();
        pLink.add(upiAnchor);
        textCell.addElement(pLink);
        
        paymentTable.addCell(textCell);

        // RIGHT CELL: QR Code
        PdfPCell qrCell = new PdfPCell();
        qrCell.setPadding(10f);
        qrCell.setBackgroundColor(new Color(245, 248, 255));
        qrCell.setBorderColor(new Color(0, 51, 102));
        qrCell.setHorizontalAlignment(Element.ALIGN_CENTER);
        qrCell.setVerticalAlignment(Element.ALIGN_MIDDLE); // Correct vertical centering

        try {
            byte[] qrBytes = generateQRCodeImage(upiUri);
            Image qrImage = Image.getInstance(qrBytes);
            qrImage.scaleToFit(85, 85);
            qrImage.setAlignment(Element.ALIGN_CENTER);
            qrCell.addElement(qrImage);
        } catch (Exception e) {
            qrCell.addElement(new Phrase("QR Code Error"));
        }
        paymentTable.addCell(qrCell);

        document.add(paymentTable);

        // 6. Footer Note
        Paragraph note = new Paragraph("Note: If the 'Tap to Pay' link is blocked by your viewer, please scan the QR code to pay.", 
                          FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 9, Color.DARK_GRAY));
        note.setSpacingBefore(10f);
        document.add(note);

        document.close();
        return out.toByteArray();
    }

    private byte[] generateQRCodeImage(String text) throws Exception {
        QRCodeWriter qrCodeWriter = new QRCodeWriter();
        BitMatrix bitMatrix = qrCodeWriter.encode(text, BarcodeFormat.QR_CODE, 250, 250);
        ByteArrayOutputStream pngOutputStream = new ByteArrayOutputStream();
        MatrixToImageWriter.writeToStream(bitMatrix, "PNG", pngOutputStream);
        return pngOutputStream.toByteArray();
    }

    private void addTableHeader(PdfPTable table, String title) {
        PdfPCell header = new PdfPCell(new Phrase(title, FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, Color.WHITE)));
        header.setBackgroundColor(Color.DARK_GRAY);
        header.setPadding(5);
        header.setHorizontalAlignment(Element.ALIGN_CENTER);
        table.addCell(header);
    }

    private void addTableCell(PdfPTable table, String text, boolean alignRight) {
        PdfPCell cell = new PdfPCell(new Phrase(text));
        cell.setPadding(8);
        if (alignRight) cell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        table.addCell(cell);
    }

    private PdfPCell createReadingCell(String text) {
        PdfPCell cell = new PdfPCell(new Phrase(text));
        cell.setPadding(5);
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        return cell;
    }
}