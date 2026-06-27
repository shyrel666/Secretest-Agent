package org.itstec.common.security;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public class MDUtil {

	public static String mdHash(String input, String salt) {
        return toMD5(salt + input);
    }
	
    /**
     * 对字符串进行MD5加密
     *
     * @param input 需要加密的字符串
     * @return 加密后的字符串
     */
    private static String toMD5(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            md.update(input.getBytes());
            byte[] digest = md.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b & 0xff));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("MD5 algorithm not found", e);
        }
    }

}
