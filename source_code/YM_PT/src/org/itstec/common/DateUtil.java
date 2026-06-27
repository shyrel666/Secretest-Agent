package org.itstec.common;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class DateUtil {
	
	public static String getDateTimeStr(){
		DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyyMMddhhmmss");
		LocalDateTime now = LocalDateTime.now();
		return dtf.format(now);
	}
	
}
