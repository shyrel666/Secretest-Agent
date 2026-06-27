package org.itstec.log.service;

import org.itstec.common.result.R;

public interface LogService {

	R<?> show(String logPath);
	
	R<?> logGrab(String logPath);
	
	R<?> logQuickArch();
	
	R<?> logArch(String para);
	
}
