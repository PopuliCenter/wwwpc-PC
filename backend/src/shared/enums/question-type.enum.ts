export enum QuestionType {
  SINGLE_CHOICE = 'single_choice',
  MULTIPLE_CHOICE = 'multiple_choice',
  SHORT_TEXT = 'short_text',
  LONG_TEXT = 'long_text',
  PHONE_NUMBER = 'phone_number',
  NUMERIC_SCALE = 'numeric_scale',
  DROPDOWN = 'dropdown',
  MATRIX_LIKERT = 'matrix_likert',
  FILE_UPLOAD = 'file_upload',
  DATE_TIME = 'date_time',
  /** Tanggal saja (tanpa jam) */
  DATE = 'date',
  /** Skala rating dengan tampilan bintang atau angka */
  RATING_SCALE = 'rating_scale',
  /** ID unik per survei — hanya angka, wajib unik per survei */
  UNIQUE_ID = 'unique_id',
  /** Wilayah Indonesia bertingkat (Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan) */
  INDONESIA_REGION = 'indonesia_region',
  /** Tanda tangan — kanvas, disimpan sebagai gambar PNG di object storage */
  SIGNATURE = 'signature',
}
