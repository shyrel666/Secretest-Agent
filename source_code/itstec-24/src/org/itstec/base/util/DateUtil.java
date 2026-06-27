package org.itstec.base.util;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;

public class DateUtil {
	
	private static Calendar cal = Calendar.getInstance();
	private static SimpleDateFormat sdf= new SimpleDateFormat("yyyy-MM-dd");
	
	public static String getDateByUpdateType(String date, String updateTpye){
		
		if("D".equals(updateTpye)){
			return getLastDate(date);
		}
		
		if("W".equals(updateTpye)){
			return getLastWeekDate(date);
		}
		
		if("M".equals(updateTpye)){
			return getLastMonthDate(date);
		}
		
		return getDateByUpdateType(updateTpye);
	}
	

	public static String getDateByUpdateType(String updateTpye){
		
		SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
		cal = Calendar.getInstance();
		String currDate=sdf.format(cal.getTime());
		
		return getDateByUpdateType(currDate, updateTpye);

	}
	
	private static Calendar transStrToCal(String str){
		Date d = new Date();
		try {
			d = sdf.parse(str);
		} catch (ParseException e) {
			e.printStackTrace();
		}
		cal.setTime(d);
		
		return cal;
	}
	
	private static String getLastDate(String date){
		cal=transStrToCal(date);
		cal.add(Calendar.DATE,   -1);
		String lastDate=sdf.format(cal.getTime());
		return lastDate;
	}
	
	private static String getLastWeekDate(String date){
		cal=transStrToCal(date);
		cal.add(Calendar.DATE,   -7);
		String lastWeekDate=sdf.format(cal.getTime());
		return lastWeekDate;
	}
	
	private static String getLastMonthDate(String date){
		cal=transStrToCal(date);
		cal.add(Calendar.MONTH,   -1);
		String lastMonthDate=sdf.format(cal.getTime());
		return lastMonthDate;
	}
	
	public static String getDateTimeStr(){
		SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMddhhmmss");
		//��ǰϵͳ����
		cal = Calendar.getInstance();
		
		return sdf.format(cal.getTime());
	}
	
	public static int getMonth(String date){
		cal=transStrToCal(date);
		return cal.get(Calendar.MONTH)+1;
	}
	public static int getDay(String date){
		cal=transStrToCal(date);
		return cal.get(Calendar.DAY_OF_MONTH);
	}

}
