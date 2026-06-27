package org.itstec.common;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.DecimalFormat;

import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellValue;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFRichTextString;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

public class Poi4Util {

    private Workbook book = null; 
    private Sheet sheet = null;   
    private Row dataRow = null;   
    private Cell dataCell = null; 
    private FormulaEvaluator evaluator = null;
    private CellStyle style = null;
    
    public Poi4Util(){
        book = new XSSFWorkbook();
        sheet = book.createSheet("new sheet");
    	evaluator=book.getCreationHelper().createFormulaEvaluator();
    	style = book.createCellStyle();
    }

    public Poi4Util(String sheetName){
        book = new XSSFWorkbook();
        sheet = book.createSheet(sheetName);
        evaluator=book.getCreationHelper().createFormulaEvaluator();
        style = book.createCellStyle();
    }

    public Poi4Util(InputStream stream, String excelVerison) throws IOException {
        if("xlsx".equals(excelVerison)){
            book = new XSSFWorkbook(stream);
        }else if("xls".equals(excelVerison)){
            book = new HSSFWorkbook(stream);
        }else{
            book = new XSSFWorkbook(stream);
        }
        stream.close();
        sheet = book.getSheetAt(0); 
        evaluator=book.getCreationHelper().createFormulaEvaluator();
        style = book.createCellStyle();
    }
    
    public Poi4Util(InputStream stream, String excelVerison, String sourceSheetName) throws IOException {
        if("xlsx".equals(excelVerison)){
            book = new XSSFWorkbook(stream);
        }else if("xls".equals(excelVerison)){
            book = new HSSFWorkbook(stream);
        }else{
            book = new XSSFWorkbook(stream);
        }
        stream.close();
        sheet = book.getSheet(sourceSheetName);
        evaluator=book.getCreationHelper().createFormulaEvaluator();
        style = book.createCellStyle();
    }

    public Poi4Util(InputStream stream, String excelVerison, int sheetNumber) throws IOException {
        if("xlsx".equals(excelVerison)){
            book = new XSSFWorkbook(stream);
        }else if("xls".equals(excelVerison)){
            book = new HSSFWorkbook(stream);
        }else{
            book = new XSSFWorkbook(stream);
        }
        stream.close();
        sheet = book.getSheetAt(sheetNumber);
        evaluator=book.getCreationHelper().createFormulaEvaluator();
        style = book.createCellStyle();
    }
    
    public String[] getSheets(){
    	String [] sheets = null;
    	if(book.getNumberOfSheets()>0){
    		sheets = new String[book.getNumberOfSheets()];
    		for(int i=0; i<book.getNumberOfSheets(); i++){
    			sheet = book.getSheetAt(i);
    			sheets[i]=sheet.getSheetName();
    		}
    	} 
    	return sheets;
    }
    
    public void copySheet(int templateNum,String newSheetName){
    	sheet=book.cloneSheet(templateNum);
    	book.setSheetName(book.getNumberOfSheets()-1, newSheetName);
    }
    
    public void insertRow(int insertRowNum){
    	sheet.shiftRows(insertRowNum, sheet.getLastRowNum(), 1,true,false);
    	sheet.createRow(insertRowNum); 
    }
    
    public void copyRows(int startRow, int cellNum){
    	sheet.shiftRows(startRow, sheet.getLastRowNum(), 1, true, false);       
    	dataRow = sheet.getRow(startRow - 1); 
        Row rowInsert = sheet.createRow(startRow); 
        rowInsert.setHeight(dataRow.getHeight()); 
      
        for (int col = 0; col<cellNum; col++) {            
            Cell cellSource = dataRow.getCell(col); 
            Cell cellInsert = rowInsert.createCell(col); 
            CellStyle cellStyle = cellSource.getCellStyle(); 
            if (cellStyle != null) {
            	cellInsert.setCellStyle(cellStyle); 
            }
        }     
    }
    
    public void merge(int startRow, int endRow, int startCol, int endCol){
    	CellRangeAddress region = new CellRangeAddress(startRow, endRow, startCol, endCol);
    	sheet.addMergedRegion(region);
    }
    
    private String checkCell(int row, int col){
        String flag="0";
        if(checkRow(row)&&checkCol(col)){
            try {
                dataRow = sheet.getRow(row);
                dataCell = dataRow.getCell((short) col);
                if(dataCell==null){
                    dataCell = dataRow.createCell((short) col);
                }
            } catch (NullPointerException e) {
                dataRow = sheet.createRow(row);
                dataCell = dataRow.createCell((short) col);
            }
            flag="3";
        }
        else{
            flag="2";
        }
        return flag;
    }
    
    @SuppressWarnings("deprecation")
    public String getCellStringValue(int row, int col) throws Exception{
        String strValue = "";
        String checkResult="0";
        checkResult=checkCell(row,col);
        if(checkResult.equals("3")){
            if(1==dataCell.getCellType().getCode()){
                strValue = dataCell.getStringCellValue();
                
            }else if(0==dataCell.getCellType().getCode()){
                DecimalFormat df = new DecimalFormat("0");  
                strValue = String.valueOf(df.format(dataCell.getNumericCellValue()));
                
            }else if(2==dataCell.getCellType().getCode()){
            	CellValue cellValue=evaluator.evaluate(dataCell);
            	strValue = cellValue.getStringValue();
            }

            return strValue;
        }
        return strValue;
    }
    
    private boolean checkRow(int row){
        if(row<0||row>65535){
            return false;
        }
        return true;
    }

    private boolean checkCol(int col){
        if(col<0||col>255){
            return false;
        }
        return true;
    }
    
	public void exportExcel(OutputStream out) throws IOException {
		book.write(out);
	}
	
	public void setCellValue(int row, int col, String strValue){
		if(checkRow(row)&&checkCol(col)){
			try {
				dataRow = sheet.getRow(row);
				dataCell = dataRow.getCell((short) col);
				if(dataCell==null){
					dataCell = dataRow.createCell((short) col);
				}
			} catch (NullPointerException e) {
				dataRow = sheet.createRow(row);
				dataCell = dataRow.createCell((short) col);
			}
		}
		XSSFRichTextString strValueRich = new XSSFRichTextString(strValue);
		dataCell.setCellValue(strValueRich);
	}
	
	public void setDoubleCellValue(int row, int col, String strValue){
		if(checkRow(row)&&checkCol(col)){
			try {
				dataRow = sheet.getRow(row);
				dataCell = dataRow.getCell((short) col);
				if(dataCell==null){
					dataCell = dataRow.createCell((short) col);
				}
			} catch (NullPointerException e) {
				dataRow = sheet.createRow(row);
				dataCell = dataRow.createCell((short) col);
			}
		}
		dataCell.setCellValue(Double.valueOf(strValue));
	}
	
	private static String getColorByCell(CellStyle style) {
        XSSFColor color = (XSSFColor) style.getFillForegroundColorColor();
        if (color != null) {
            if (color.isRGB()) {
                byte[] bytes = color.getRGB();
                if (bytes != null && bytes.length == 3) {
                    StringBuilder sb = new StringBuilder();
                    sb.append("rgb");
                    sb.append("(");
                    for (int i = 0; i < bytes.length; i++) {
                        byte b = bytes[i];
                        int temp;
                        if (b < 0) {
                            temp = 256 + (int) b;
                        } else {
                            temp = b;
                        }
                        sb.append(temp);
                        if (i != bytes.length - 1) {
                            sb.append(",");
                        }
                    }
                    sb.append(")");
                    return sb.toString();
                }
            }
        }
        return null;
    }
	
	public String getCellBackgroundColor(int row, int col){
		String color="";
        String checkResult="0";
        checkResult=checkCell(row,col);
        if(checkResult.equals("3")){
        	style = dataCell.getCellStyle();
        	color = getColorByCell(style);
        }
        return color;
	}
	
}
