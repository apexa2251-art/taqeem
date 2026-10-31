export const errors = {
  invalid_credentials: [
    "البريد أو كلمة المرور غير صحيحة. استخدم بيانات حساب تعقيم.",
    "Incorrect email or password. Use your Taqeem account credentials.",
  ],
  PASSWORD_LENGTH: [
    "كلمة المرور يجب أن تكون من 12 إلى 128 حرفًا.",
    "Password must contain 12 to 128 characters.",
  ],
  STAFF_DETAILS_REQUIRED: [
    "أكمل اسم الموظف وبريد الدخول والفرع والدور.",
    "Complete the staff name, sign-in email, branch and role.",
  ],
  ACCOUNT_CREATE_FAILED: [
    "تعذر إنشاء الحساب. قد يكون البريد مسجلاً أو كلمة المرور غير مقبولة.",
    "Could not create the account. The email may already be registered or the password may not meet the requirements.",
  ],
  PASSWORD_UPDATE_FAILED: [
    "تعذر تحديث كلمة المرور. اختر كلمة جديدة مطابقة للشروط.",
    "Could not update the password. Choose a new password that meets the requirements.",
  ],
  ACCOUNT_RATE_LIMIT: [
    "محاولات إدارة الحسابات كثيرة. انتظر عشر دقائق.",
    "Too many account changes. Please wait ten minutes.",
  ],
  USER_NOT_FOUND: [
    "حساب الموظف غير موجود أو غير مفعّل.",
    "The staff account is missing or inactive.",
  ],
  AUDIT_UNAVAILABLE: [
    "تعذر توثيق العملية، لذلك لم يتم تغيير الحساب. حاول لاحقًا.",
    "The audit service is unavailable, so the account was not changed. Try again later.",
  ],
  ACCOUNT_REQUEST_FAILED: [
    "تعذر تنفيذ إدارة الحسابات. تواصل مع المسؤول.",
    "Account management could not be completed. Contact your administrator.",
  ],
  CYCLE_NUMBER_REQUIRED: [
    "اختر الجهاز وأدخل رقم الدورة الحقيقي من التقرير.",
    "Choose the device and enter the actual machine cycle number from the printout.",
  ],
  SETUP_REQUIRED: [
    "يلزم ربط مشروع Supabase أولاً. راجع ملف التشغيل المرفق.",
    "Connect a Supabase project first. See the setup guide.",
  ],
  ACCOUNT_NOT_ASSIGNED: [
    "حسابك غير مفعّل في النظام. اطلب من المسؤول تفعيل ملفك وربطه بالفرع.",
    "Your account is not provisioned. Ask the administrator to activate it and assign a branch.",
  ],
  FORBIDDEN: [
    "ليست لديك صلاحية لهذا الإجراء أو الفرع.",
    "You do not have permission for this action or branch.",
  ],
  AUTH_REQUIRED: [
    "انتهت الجلسة. سجّل الدخول مجدداً.",
    "Your session expired. Sign in again.",
  ],
  DUPLICATE_CYCLE: [
    "رقم الدورة مسجل لهذا الجهاز في التاريخ نفسه. افتح السجل الموجود.",
    "This machine cycle number already exists for this device and date. Open the existing record.",
  ],
  IMMUTABLE_OR_NOT_OWNER: [
    "السجل ليس مسودتك أو سبق إرساله. استخدم طلب تصحيح موثق.",
    "This is not your draft or it was submitted. Request a documented revision.",
  ],
  DEVICE_NOT_CONFIGURED: [
    "يحتاج الجهاز إلى تحديد الفرع وتفعيل ملفه من المسؤول.",
    "The administrator must assign and activate the device.",
  ],
  PROGRAM_REQUIRED: [
    "اختر برنامجاً معتمداً لهذا الجهاز.",
    "Choose an approved device program.",
  ],
  REPORT_REQUIRED: [
    "أرفق تقرير جهاز التعقيم قبل الإرسال.",
    "Attach the machine printout before submitting.",
  ],
  ITEMS_REQUIRED: ["أضف محتويات الحمولة.", "Add the load contents."],
  ITEMS_INVALID: [
    "أدخل اسم كل عنصر وعدداً صحيحاً موجباً.",
    "Enter each item name and a positive whole quantity.",
  ],
  PACKS_REQUIRED: [
    "أدخل عدد العبوات الفعلي داخل الدورة.",
    "Enter the actual number of packages in the cycle.",
  ],
  READINGS_REQUIRED: [
    "أكمل القراءات الفعلية ووقت البداية والنهاية.",
    "Complete actual readings and start/end times.",
  ],
  READINGS_INVALID: [
    "راجع القراءات؛ يجب أن تكون أرقاماً صحيحة المعنى.",
    "Check the numeric readings.",
  ],
  RESULTS_REQUIRED: [
    "اختر نتائج M وC وD وحالة اكتمال الدورة.",
    "Select M, C, D and cycle completion results.",
  ],
  TIME_ORDER: [
    "وقت النهاية يجب أن يكون بعد البداية؛ حدد التاريخ الصحيح للدورات التي تتجاوز منتصف الليل.",
    "End must follow start. Use the correct dates for cycles crossing midnight.",
  ],
  DATE_MISMATCH: [
    "تاريخ التشغيل يجب أن يطابق تاريخ بداية الدورة بتوقيت السعودية.",
    "Operating date must match the cycle start date in Saudi time.",
  ],
  PRESSURE_UNIT_MISMATCH: [
    "وحدة الضغط لا تطابق البرنامج المعتمد.",
    "Pressure unit does not match the approved program.",
  ],
  NA_NOT_ALLOWED: [
    "لا ينطبق متاح لـ C فقط عندما يسمح البرنامج المعتمد، مع كتابة السبب.",
    "NA is allowed for C only if the approved program permits it, with a reason.",
  ],
  INDEPENDENT_REVIEW_REQUIRED: [
    "اعتماد الاستخدام يحتاج مراجعاً مخولاً آخر غير مُدخل السجل.",
    "Use approval requires another authorized reviewer, different from the record operator.",
  ],
  APPROVAL_BLOCKED_RESULTS: [
    "لا يمكن اعتماد الاستخدام: نتيجة غير مقبولة أو الدورة لم تكتمل دون إنذار.",
    "Approval blocked: an unacceptable result or an incomplete/alarmed cycle.",
  ],
  APPROVAL_BLOCKED_CRITERIA: [
    "القراءات لا تستوفي معايير البرنامج المعتمدة.",
    "Readings do not meet approved program criteria.",
  ],
  APPROVAL_BLOCKED_BI: [
    "لم تكتمل نتيجة الاختبار الحيوي والشاهد المطلوبة أو لم تكن مقبولة.",
    "The required BI and control results are incomplete or unacceptable.",
  ],
  REASON_ACTION_REQUIRED: [
    "اكتب السبب والإجراء التصحيحي للحجز أو الرفض.",
    "Enter a reason and corrective action for hold or rejection.",
  ],
  REVISION_REASON_REQUIRED: [
    "طلب التصحيح يحتاج مراجعاً مخولاً وسبباً مكتوباً.",
    "A revision requires an authorized reviewer and a written reason.",
  ],
  CRITERIA_REQUIRED: [
    "أدخل معايير قبول البرنامج من مرجعه المعتمد.",
    "Enter program acceptance criteria from its approved reference.",
  ],
  CRITERIA_INVALID: [
    "راجع نطاقات القبول في البرنامج.",
    "Check program acceptance ranges.",
  ],
  PROGRAM_DETAILS_REQUIRED: [
    "أكمل اسم البرنامج والجهاز ومرجع تعليمات المصنع.",
    "Complete program name, device and IFU reference.",
  ],
  DEVICE_DETAILS_REQUIRED: [
    "أكمل الطراز ومرجع تعليمات المصنع قبل تفعيل الجهاز.",
    "Complete model and IFU reference before device activation.",
  ],
  DEVICE_HAS_HISTORY: [
    "لا يمكن نقل جهاز لديه سجل دورات إلى فرع آخر بهذه الطريقة.",
    "A device with cycle history cannot be reassigned this way.",
  ],
  BI_DETAILS_REQUIRED: [
    "أكمل بيانات تشغيلة الاختبار والشاهد وبداية الحضانة والنتائج.",
    "Complete test/control lots, incubation start and results.",
  ],
  READ_TIME_REQUIRED: [
    "سجّل وقت القراءة بعد بداية الحضانة.",
    "Record a reading time after incubation start.",
  ],
  CHECK_DETAILS_REQUIRED: [
    "أكمل نوع الفحص ووقت تنفيذه ونتيجته.",
    "Complete check type, time and result.",
  ],
  CYCLE_DEVICE_MISMATCH: [
    "الدورة لا تتبع الجهاز المختار.",
    "The cycle does not belong to the selected device.",
  ],
  FILE_INVALID: [
    "الملف غير صالح. ارفع PDF أو PNG أو JPEG فعلياً.",
    "Invalid file. Upload an actual PDF, PNG or JPEG.",
  ],
  FILE_TOO_LARGE: [
    "أقصى حجم للمرفق ١٠ ميجابايت.",
    "Maximum attachment size is 10 MB.",
  ],
  REQUEST_FAILED: [
    "تعذر إكمال العملية. حاول مجدداً؛ إذا استمر الخطأ تواصل مع المسؤول.",
    "The request failed. Try again or contact your administrator.",
  ],
};
