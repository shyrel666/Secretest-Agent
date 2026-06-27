package org.itstec.common;

import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;
import java.util.TreeMap;

public class SortUtil {

    /**
     * 将一个HashMap按照键的ASCII码排序，并转换成URL格式的字符串。
     *
     * @param map 需要排序和编码的HashMap
     * @return 排序后字符串
     */
    public static String mapToStrBySort(HashMap<String, Object> map) {
        if (map == null || map.isEmpty()) {
            return "";
        }

        // 使用TreeMap来按照键排序
        Map<String, Object> sortedMap = new TreeMap<>(map);

        // 构建URL格式的字符串
        StringBuilder urlBuilder = new StringBuilder();
        for (Entry<String, Object> entry : sortedMap.entrySet()) {
            String key = entry.getKey();
            String value = (String) entry.getValue();

            // 忽略空值
            if (value == null || value.isEmpty()) {
                continue;
            }

            // 将键和值进行URL编码（如果需要）
            // 这里假设键和值不需要编码，如果需要，可以使用URLEncoder.encode方法进行编码
            urlBuilder.append(key).append("=").append(value).append("&");
        }

        // 移除最后一个多余的"&"
        if (urlBuilder.length() > 0) {
            urlBuilder.deleteCharAt(urlBuilder.length() - 1);
        }

        return urlBuilder.toString();
    }
    
}
