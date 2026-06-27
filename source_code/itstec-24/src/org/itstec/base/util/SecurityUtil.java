package org.itstec.base.util;

public class SecurityUtil {

    public static String replaceSpecialStr(String str) {
        StringBuilder sb = new StringBuilder();
        str = str.toLowerCase();
        for(int i = 0; i < str.length(); i++) {
            char ch = str.charAt(i);
            if (ch >= 48 && ch <= 57 ){
                sb.append(ch);
            }
            else if(ch >= 97 && ch <= 122) {
                sb.append(ch);
            }
            else if(ch == '/' || ch == '.' || ch == '-'){
                sb.append(ch);
            }
        }
        return sb.toString();
    }

}