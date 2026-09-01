const BAD_REGEX = /^(a+)+$/;

function validate(req) {
  return BAD_REGEX.test(req.body.value);
}
