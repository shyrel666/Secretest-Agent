package org.itstec.base.util;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public class PassUtil {

	public static String checkPwd(String password) {
		Map<String, String> map = new HashMap<String, String>();
		for (int i = 0; i < password.length(); i++) {
			int A = password.charAt(i);
			if (A >= 48 && A <= 57) {
				map.put("number", "number");
			} else if (A >= 65 && A <= 90) {
				map.put("bigLetter", "bigLetter");
			} else if (A >= 97 && A <= 122) {
				map.put("smallLetter", "smallLetter");
			} else {
				map.put("symbol", "symbol");
			}
		}
		Set<String> sets = map.keySet();
		int pwdSize = sets.size();
		int pwdLength = password.length();
		if (pwdSize >= 3 && pwdLength >= 8) {
			return "1";
		} else {
			return "0";
		}
	}

}
