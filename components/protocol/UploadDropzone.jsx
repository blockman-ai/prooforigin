export default function UploadDropzone({
  file,
  accept,
  onChange,
  title = "Drop a file or tap to browse",
  hint = "Supported media and documents",
}) {
  return (
    <label className="upload-dropzone">
      <input
        className="file-input-hidden"
        type="file"
        accept={accept}
        onChange={onChange}
      />
      <span className="upload-dropzone__ring" aria-hidden="true">
        <span className="upload-dropzone__icon">↑</span>
      </span>
      <p className="upload-dropzone__title">{file ? file.name : title}</p>
      <p className="upload-dropzone__hint">{hint}</p>
    </label>
  );
}
